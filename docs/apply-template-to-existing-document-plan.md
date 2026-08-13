# Apply a Template to an Existing Draft Document

## Status

Proposed MVP. This document defines the behavior before implementation.

## Goal

Allow a user editing a draft envelope to apply an existing, accessible template to the currently selected envelope item.

The existing uploaded PDF must remain unchanged. The template contributes field configuration and field placement, while the current envelope remains the source of truth for recipients unless the user later edits recipients through the normal editor flow.

## User flow

1. The user opens a draft envelope in the modern editor.
2. The user can start the operation from either entry point:
   - The **Apply Template** action in the right-side fields panel above **Detect with AI**, targeting the currently selected document tab.
   - A per-document template icon beside the existing edit/remove icons in the **Documents** list, targeting that exact document row. When template-origin fields exist, this row action also exposes **Remove Template**.
3. Both entry points open the same Documenso-style modal, use the same authorization and mapping logic, and call the same server operation.
4. The user selects a template.
5. If the selected template contains multiple envelope items, the modal asks which template item should be applied to the selected target envelope item.
6. The modal previews the recipient compatibility and reports any fields that cannot be mapped.
7. If the selected envelope item already has fields, the user must confirm that those fields will be replaced.
8. After confirmation, the template fields are copied to the selected envelope item and translated to the current envelope’s recipient IDs.
9. The user may continue to move, edit, delete, or add fields normally.

In the MVP, the selected document shows **Remove Template** after a successful application. We do not need a separate **Change Template** action; applying another template through **Apply Template** is the replacement path after confirmation.

## MVP scope

Included:

- Draft document envelopes only.
- Modern envelope editor only.
- One selected target envelope item at a time.
- Team templates and organisation templates visible to the current user.
- Existing template visibility and team-role authorization rules.
- Single-document and multi-document templates.
- Recipient mapping by compatible role and signing order.
- Replacement of fields on the selected target item after explicit confirmation.
- Removing previously applied template fields while preserving fields added manually afterward.
- Normal post-application field editing.

Not included:

- Automatic addition of template recipients.
- An interactive recipient-mapping screen.
- Automatic removal, renaming, or replacement of current recipients.
- Applying a template to multiple target items in one operation.
- Replacing the target PDF with the template PDF.
- Copying template attachments.
- Applying template email, distribution, security, reminder, or envelope-level settings.
- Legacy editor support.
- Direct-link recipient behavior.
- Automatic placeholder-text detection or PDF layout matching.
- Applying a template item that contains no fields.

## Recipient behavior

Recipients belong to the whole envelope, while fields belong to individual envelope items. Applying a template must therefore translate template recipient references to recipients already present in the current envelope.

### Mapping rules

For each template recipient used by a field:

1. Match only recipients with a compatible role.
2. Prefer the same signing order.
3. If exactly one compatible current recipient remains, use it.
4. If there is no match or more than one possible match, do not apply the template and show a clear mapping error.

Template names and emails are not reliable identity keys because templates may use blank values or placeholders such as `Recipient 1` and `recipient.1@documenso.com`. They may be shown as context in the modal but must not be used as the primary mapping key.

The MVP does not add missing recipients automatically or provide an interactive mapping screen. If the template requires a recipient that cannot be mapped, the user must add or adjust recipients through the normal recipient editor first, then retry.

Recipients already in the envelope but unused by the template remain unchanged and simply receive no fields from this operation.

The mapping must preserve the current recipient IDs so existing fields and signing state remain attached to the correct people.

## Multi-document behavior

The current envelope item is selected by the existing document tabs and is the only target of the operation.

When a template has multiple envelope items, the modal displays the template items by title/order and requires the user to choose exactly one source item. Only fields whose `envelopeItemId` belongs to that selected template item are copied.

The selected template item’s fields are translated to the current target item ID. Their page numbers and percentage positions are preserved because the target PDF is intentionally not replaced. The UI should warn that field positions assume a compatible page layout.

Applying the same template to another target item is a separate action. The user selects that target tab and repeats the flow.

## Field behavior

- Existing fields on the selected target item are replaced only after confirmation. Reapplying a template replaces all current fields on that item, including manually added fields; the confirmation must state this explicitly.
- Fields on other envelope items are untouched.
- Template field types, dimensions, positions, and field metadata are copied.
- Template field recipient IDs are translated to current envelope recipient IDs.
- Field IDs and local form IDs are newly generated by the normal editor/server path.
- Existing recipient interaction protections still apply. A draft with recipient activity must not allow changes that the existing field authorization rules reject.
- After application, the existing editor field controls remain fully available.
- Editing or moving a copied field does not remove its template-origin marker; **Remove Template** still removes that field.

A template source item with no fields is not applicable. The modal must alert the user and prevent application. For a multi-document template, empty source items are disabled or clearly marked so the user can choose a source item that contains fields.

Fields copied from a template are marked with their source template item ID. Manual fields added later are not marked. Editing a copied field does not remove its source marker.

## Template selection and authorization

Do not create a new permission query.

Reuse the existing permission-aware template queries:

- `findTemplates()` for templates in the current team.
- `findOrganisationTemplates()` for organisation templates available to the current team and role.
- The existing template-by-ID authorization path for the final server-side operation.

The modal may combine and label the two result sets, but the server must re-authorize the selected template at apply time. A template ID received from the browser is never sufficient by itself.

Do not expose templates from another team or organisation merely because they appear in a client-side list.

## Proposed server operation

Add a dedicated authenticated operation for applying a template to an existing draft envelope item. Keep it separate from `createDocumentFromTemplate`; that operation creates a new envelope and creates new recipients, which is not appropriate here.

The operation should receive:

- Current envelope ID.
- Target envelope item ID.
- Selected template ID.
- Selected template envelope item ID.
- `replaceExistingFields` boolean. The server rejects the operation when target fields exist and this is false.
- Request metadata for audit logging.

The server should:

1. Authorize the current user for the draft envelope and target item.
2. Authorize the selected template using the existing team/organisation visibility rules.
3. Verify both envelopes are compatible with the modern editor operation.
4. Load template recipients, fields, and envelope items.
5. Resolve recipient mappings using the rules above.
6. Validate `replaceExistingFields` and that fields can be modified under existing recipient interaction rules.
7. Delete or replace only fields attached to the target envelope item, inside a transaction.
8. Create translated fields for the target item.
9. Record a document audit event identifying the applied template and target item.
10. Return the updated target fields and enough template metadata for the UI state.

The operation must be idempotent for a repeated request from the same UI action. It should not duplicate fields if the client retries after a successful response.

Add a dedicated authenticated remove operation for the selected draft envelope item. It must authorize the same target envelope/item and delete only fields with a template source marker. Manually added fields must remain untouched.

Add one additive Prisma migration with a nullable template-source marker on `Field` (the source template envelope-item ID). No new table is required for the MVP.

## Template state

The MVP persists template provenance on copied fields so the user can remove a template safely after editing or reloading the draft.

The selected document shows **Remove Template** when it contains fields with a template source marker. Removing a template deletes only those marked fields and preserves manually added fields. Applying another template still replaces the selected item's existing fields after confirmation, then marks the newly copied fields. Applying or removing a template from the Documents step does not navigate the user away from that step; it shows a success state and leaves navigation to the user.

No persistence beyond the field provenance marker is required for the MVP.

## UI details

Create a modal using the same dialog primitives and visual conventions as `EnvelopeEditorSettingsDialog`.

The modal should include:

- Search/filter by template title.
- Team/organisation source label.
- Template item count.
- Recipient compatibility summary.
- Source-item selector for multi-document templates.
- Warning that the target PDF is preserved and field positions depend on compatible layout.
- Confirmation when target fields will be replaced.
- A clear alert and disabled apply action when the selected source item contains no fields.
- Loading, empty, authorization, mapping, and server-error states.

The **Apply Template** button should be disabled when:

- The envelope is not a draft.
- No target envelope item is selected.
- The current recipient/field state is being saved.
- The editor configuration disallows field changes.

The right-panel button should not appear in the upload step or on the left navigation because it operates on the selected document item in the Add Fields step. The document-list icon is a row-level action and must sit beside that row’s existing edit/remove actions; it must not be placed in the empty space between rows or as an unscoped envelope-level action. When a row contains template-origin fields, its row action exposes **Remove Template** as well as **Apply Template**.

## Error behavior

Use the existing `AppError` pattern and return actionable messages, including:

- Target envelope item not found.
- Template not found or no longer accessible.
- Template source item not found.
- Template requires a compatible recipient that is not present.
- Recipient mapping is ambiguous.
- Existing target fields require replacement confirmation.
- Selected template item contains no fields and cannot be applied.
- Recipient fields can no longer be modified.
- Envelope is not a draft.

The MVP does not replace the target PDF or attempt automatic PDF layout matching. It preserves template coordinates and shows a layout warning so the user can review the result before sending.

Do not silently skip unmapped fields. A partial application would be difficult for users to detect and could produce an incorrectly routed signing document.

## Tests

### Server tests

- Team template is returned only when the current user can access it.
- Organisation template visibility follows the current team role.
- A user cannot apply a template from another team or inaccessible organisation template.
- A single-document template maps fields to the selected target item.
- A multi-document template applies only the chosen template item.
- Fields on other target items remain unchanged.
- Existing target fields are replaced only by an explicit confirmation-supported request.
- A request without `replaceExistingFields` cannot replace existing target fields and makes no partial changes.
- Removing a template deletes only template-origin fields and preserves manually added fields.
- An empty template item is rejected without changing any fields.
- Template recipient IDs are translated to current recipient IDs.
- Placeholder/blank template names and emails do not break mapping.
- Role and signing-order mismatch returns a clear validation error.
- Missing or ambiguous recipient mapping does not partially apply fields.
- Recipient count is not changed by the MVP operation.
- Recipient interaction restrictions are enforced.
- Retrying the same operation does not duplicate fields.
- Audit log records the application.

### UI tests

- Button appears above **Detect with AI** only in the Add Fields step.
- A template icon appears beside edit/remove on each document row.
- Both UI entry points open the same modal and target the correct document item.
- The operation targets the currently selected document tab.
- The template list combines accessible team and organisation templates.
- Multi-document template selection is displayed and required.
- Existing-field replacement confirmation appears when needed.
- Reapplication warns that manually added fields on the target item will also be replaced.
- Empty template items are clearly disabled/rejected.
- Remove Template preserves manually added fields.
- Applying or removing from the Documents step stays on that step and shows a success state.
- Mapping errors are shown clearly.
- Successful application refreshes the selected item’s fields without changing other items or recipients.
- User can add a new field after applying a template.

## Acceptance criteria

- A user can upload a PDF, select a document tab, apply an accessible template, and see that template’s fields on the selected PDF.
- A user can start the same operation from the template icon on the intended document row.
- The uploaded PDFs are never replaced by template PDFs.
- A multi-document envelope can use a different template source item for each target document by repeating the operation per tab.
- Existing envelope recipients remain unchanged.
- Templates with blank or placeholder recipient names work when role/signing-order mapping is unambiguous.
- Templates requiring unavailable or ambiguous recipients are rejected before any field changes are made.
- Existing fields are replaced only after explicit confirmation.
- Reapplying a template clearly warns that manually added fields on the target item will also be replaced.
- Removing a template removes only fields imported from that template and preserves manually added fields.
- Users can continue to add, edit, move, and delete fields after applying a template.
- All template access checks are enforced server-side.
- No legacy Documenso behavior is changed; the feature adds one additive migration for template-field provenance.

## Implementation notes

- Prefer existing `findTemplates`, `findOrganisationTemplates`, `getTemplateById`, envelope editor provider, `useCurrentEnvelopeRender`, and `editorFields` mechanisms.
- Prefer a dedicated server operation over extending the create-from-template flow.
- Keep the first change limited to the editor, the new operation, its schemas, and focused tests.
- Do not add dependencies unless an existing package cannot support the required behavior.
