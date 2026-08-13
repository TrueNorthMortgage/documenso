# Conditional Fields Plan

## Status

Proposed MVP. This document captures the product and technical decisions agreed before implementation.

## Goal

Allow a sender to show or hide fields during signing based on another field's value, similar to DocuSign conditional fields.

Example:

```text
Do you own a property? = Yes
  -> show Property Address, Property Type, and Year Purchased
```

The feature must work for both regular document envelopes and templates.

## Core behavior

Conditional logic is a visibility rule:

```text
parent field + condition -> child field visibility
```

The first version supports:

- Checkbox parents, based on a specific selected option.
- Radio parents, based on a selected option.
- Dropdown parents, based on a selected option.
- Text parents, based on an exact text value or any non-empty text.
- Multiple child fields controlled by one parent condition.
- Multiple conditions on one parent, allowing different values to reveal different child fields.
- Any existing field type as a child, including signature, initials, date, checkbox, radio, dropdown, text, and number fields.
- One condition per child field.
- Rules only between fields belonging to the same recipient, same envelope, and same document.

The relationship is stored by field ID, not by field label. Labels are presentation text and may be changed after a rule is created.

## Visibility and values

### Editing

Conditional fields remain visible in the sender's editor so they can be positioned and configured. The editor displays a conditional indicator or badge on child fields.

The selected field's right-side settings panel is the configuration entry point:

- Supported parent fields show a **Conditional Logic** section.
- The sender selects the activating value.
- The sender selects one or more eligible child fields.
- Existing parent rules are listed with their child fields and can be edited or removed.
- A child field shows a read-only summary such as `Shown when “Owns property?” is “Yes”` and provides **Remove condition**.

The child summary is important because it lets a sender remove a rule while looking at the child, even though the primary creation workflow starts from the parent.

### Signing and preview

Before a parent has a matching value, its child fields are hidden. When the value changes, visibility updates immediately.

Visible required fields are required normally. Hidden fields:

- Do not block completion.
- Do not count as missing required fields.
- Do not contribute an effective submitted value.
- Do not count as completed signature/action fields for the current signing decision.

Previously entered child values are preserved when a parent hides the child. If the child becomes visible again, the previous value is restored. While hidden, that value is ignored for validation, completion, exports, and webhook payloads.

The sender's Preview should evaluate the same rules as recipient signing. The sender must be able to select parent values and test each branch before sending.

The editor continues to show all fields; only preview and recipient signing views apply conditional visibility.

## Condition semantics

Rules use normalized comparisons:

- Text values are trimmed and compared case-insensitively.
- Radio and dropdown conditions match the selected option value.
- Checkbox conditions match when the configured option is selected.
- Text `Any text` matches when the trimmed field value is non-empty.
- Empty or unanswered parents do not activate conditions.

The first version does not need a separate unchecked-checkbox condition. A child that should appear when a checkbox is not selected can instead be represented by the normal always-visible state or addressed in a later rule extension.

## Recipient and document boundaries

The server must reject a rule unless:

- Parent and child fields have the same recipient.
- Parent and child fields belong to the same envelope.
- Parent and child fields belong to the same envelope item/document.
- The parent is a supported type.
- The child is not the parent itself.
- The child does not already have another rule.
- The configured value is valid for the parent field.

Rules must not cross recipients or documents in the MVP. This keeps the behavior understandable and avoids a signer changing another signer's required workflow.

## Parent and child rules

One parent may have many rules:

```text
Employment type = Employee
  -> show Employer name

Employment type = Self-employed
  -> show Business name

Employment type = Other
  -> show Employment explanation
```

One child may have only one rule. Nested conditions are deferred. A conditional child cannot also act as a parent in the MVP.

## Data model

Use a small additive Prisma migration with a dedicated rule model rather than putting relationship data in `fieldMeta`.

Proposed model:

```text
ConditionalFieldRule
  id
  childFieldId       unique
  parentFieldId
  operator           EQUALS | ANY_TEXT
  value              nullable string
  createdAt
  updatedAt
```

Relationships:

- `childFieldId` references the field whose visibility is controlled.
- `parentFieldId` references the trigger field.
- `childFieldId` is unique, enforcing one condition per child.
- `parentFieldId` is indexed, supporting one parent with many children.
- Deleting a parent or child cascades the rule row, leaving the remaining field always visible rather than leaving a broken reference.

The server still performs explicit envelope, document, recipient, type, value, and cycle validation. Database relations alone are not sufficient for those business rules.

Using a dedicated table is safer than `fieldMeta` because:

- Parent and child IDs are foreign-keyed.
- One-child/one-rule is enforced by a unique constraint.
- Rules can be queried without parsing arbitrary JSON.
- API validation has a dedicated schema.
- Template cloning can remap field IDs transactionally.
- Invalid or orphaned relationships are easier to detect and audit.

Existing fields remain unchanged when no rule exists.

## Server evaluation

Create a shared server-side visibility helper that receives the fields for the current document and returns effective visibility. The same behavior must be used by:

- Recipient signing data loaders.
- Required-field validation.
- Completion checks.
- Preview data.
- Completed field/export handling.
- Webhook and API effective-value serialization.

Do not implement separate visibility logic in each field component.

Evaluation rules:

1. Fields without a rule are visible.
2. A rule is active only when its parent value matches.
3. A child with an inactive rule is hidden.
4. Since nested conditions are not supported, evaluation is one level deep.
5. Stored values remain unchanged even when a field becomes hidden.

At send time, conditional signature fields still count as potential signature fields for recipient configuration checks. At signing/completion time, only currently visible required fields count as outstanding work.

## Editor UI

Add conditional settings to the existing field settings panel rather than creating a separate page or global action.

For a supported parent field:

```text
Conditional Logic

[Add condition]

When value is: [Yes ▼]
Show fields:
  [x] Property Address
  [x] Property Type
  [x] Year Purchased

Existing conditions
  Yes -> 3 fields       [Edit] [Remove]
```

For a text parent:

```text
When value is:
  [Exact text ▼] [Self-employed]
  or
  [Any text]
```

Eligible children are limited to fields for the same recipient and same document. The current parent is excluded. Children already assigned to a condition are disabled or clearly marked.

For a child field:

```text
Conditional visibility
Shown when “Employment type” is “Self-employed”.

[Remove condition]
```

If a parent field is deleted, the editor warns that its affected conditions will be removed. After confirmation, the child fields remain and become always visible.

## Templates

Conditional rules are supported in templates and regular documents.

When a template is applied to a draft document:

1. Copy the selected template fields using the existing template application flow.
2. Build a map from each template field ID to its newly created document field ID.
3. Copy each rule only after all referenced fields have been mapped.
4. Remap both `parentFieldId` and `childFieldId` to the new IDs in the same transaction.
5. Reject the operation without partial changes if any referenced field cannot be mapped.

When creating a document from a template, use the same field-ID remapping behavior. Existing recipient mapping rules still apply.

Template rules must not silently disappear during field copying, replacing fields, or removing template-origin fields.

## API and webhooks

Expose conditional rules through the API with the same constraints as the UI:

- Create, update, delete, and read rules by field IDs.
- Reject cross-recipient and cross-document relationships.
- Reject unsupported parent types and invalid option values.
- Reject a second rule for the same child.
- Return clear validation errors.

Completed-document and webhook payloads should expose the field definition and condition metadata for auditability. Effective values must follow visibility:

- Visible fields return their normal values.
- Hidden fields are marked inactive/hidden and do not return a usable effective value.
- A stale value retained in storage must never be treated as an active answer.

## What is intentionally not included

Defer these features until the simple model is proven:

- Nested conditions.
- `AND`/`OR` groups.
- Formula fields or calculated helper fields.
- Numeric comparisons.
- Unchecked-checkbox conditions.
- Cross-recipient rules.
- Cross-document rules.
- Conditional recipients.
- Conditional documents or attachments.
- Conditional envelope settings.
- Automatic field deletion when hidden.
- Automatic clearing of stored values when hidden.

The more complex multi-trigger examples commonly implemented with formula/helper fields are intentionally outside this MVP. They would require a rule expression engine, cycle detection, richer authoring UI, and more complicated validation.

## Errors and safety

Use the existing `AppError` pattern and return actionable errors for:

- Parent or child field not found.
- Parent and child belonging to different recipients.
- Parent and child belonging to different documents.
- Unsupported parent type.
- Invalid radio, checkbox, or dropdown option.
- Missing text condition.
- Child already having a condition.
- Parent and child being the same field.
- Template rule references not mapping during field cloning.
- Attempt to modify rules after the document can no longer be edited.

Rule changes must use the same draft/editor authorization rules as field changes. A browser-provided field ID is never trusted without reloading and authorizing both fields server-side.

## Migration and deployment

Add one forward-only Prisma migration for `ConditionalFieldRule`. Existing documents and templates receive no rules and remain behaviorally unchanged.

The migration must:

- Create the rule table.
- Add foreign keys with safe delete behavior.
- Add the unique child-field constraint.
- Add the parent-field index.
- Complete successfully on an empty database and an existing database.

No data backfill is required.

## Testing plan

### Unit tests

- Checkbox option selection activates only the matching rule.
- Radio and dropdown selected values activate the correct child fields.
- Exact text matching trims whitespace and ignores case.
- Any-text matching ignores empty and whitespace-only values.
- Unanswered parents keep children hidden.
- Multiple parent values reveal different child groups.
- Hidden required fields are excluded from outstanding-field validation.
- Hidden stored values are not emitted as effective values.
- Values are preserved when a child is hidden and shown again.
- Unsupported parent types are rejected.
- A child cannot have two rules.
- Cross-recipient and cross-document rules are rejected.
- Parent/child self-reference is rejected.

### Server/API tests

- Authorized users can create, update, and delete rules on drafts.
- Unauthorized users cannot modify rules.
- Invalid option values return validation errors.
- Rule deletion makes the child always visible without deleting the child.
- Parent deletion clears rules safely.
- Completed or locked documents reject rule changes.

### Template tests

- Template rules are copied to new documents.
- Parent and child IDs are correctly remapped.
- Multiple conditions survive template cloning.
- A failed rule mapping rolls back fields and rules together.
- Applying a template preserves the template's conditional behavior.

### End-to-end tests

- Configure a radio rule in the editor and verify the child marker.
- Preview each parent branch.
- Sign with the child hidden and verify it does not block completion.
- Sign with the child visible and verify required validation.
- Change the parent after entering a child value and verify the value returns when the child is shown again.
- Test a checkbox option-specific rule.
- Test a multi-document envelope and verify rules cannot cross documents.

## References

- [DocuSign conditional tabs](https://www.docusign.com/blog/developers/tabs-deep-dive-conditional-tabs)
- [DocuSign conditional field values](https://www.docusign.com/blog/developers/conditional-field-values)
- [Solusign conditional logic guide](https://www.solusign.com/how-to-use-docusign-conditional-logic-fields-for-beginners/)
