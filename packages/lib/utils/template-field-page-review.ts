import { getFieldsOutsideDocument } from './field-placements';

type TemplateFieldPageReference = {
  id: number;
  envelopeItemId: string;
  page: number;
  fieldGroupId: string | null;
  conditionalChildRule?: { parentFieldId: number } | null;
};

export type TemplateFieldOmissionReason = 'missing-page' | 'group' | 'condition';

/** Keep groups intact and omit descendants whose conditional parent cannot be copied. */
export const getTemplateFieldPageReview = <T extends TemplateFieldPageReference>(
  fields: T[],
  pageCount: number | undefined,
) => {
  const reasons = new Map<number, TemplateFieldOmissionReason>();
  const missingPageFields = fields.filter(
    (field) => getFieldsOutsideDocument([field], [{ id: field.envelopeItemId, pageCount }]).length > 0,
  );

  for (const field of missingPageFields) {
    reasons.set(field.id, 'missing-page');
  }

  let hasChanges = true;

  while (hasChanges) {
    hasChanges = false;
    const omittedGroupIds = new Set(
      fields.filter((field) => reasons.has(field.id) && field.fieldGroupId).map((field) => field.fieldGroupId),
    );

    for (const field of fields) {
      if (reasons.has(field.id)) {
        continue;
      }

      if (field.fieldGroupId && omittedGroupIds.has(field.fieldGroupId)) {
        reasons.set(field.id, 'group');
        hasChanges = true;
      } else if (field.conditionalChildRule && reasons.has(field.conditionalChildRule.parentFieldId)) {
        reasons.set(field.id, 'condition');
        hasChanges = true;
      }
    }
  }

  return {
    fieldsToApply: fields.filter((field) => !reasons.has(field.id)),
    omittedFields: fields.flatMap((field) => {
      const reason = reasons.get(field.id);
      return reason ? [{ field, reason }] : [];
    }),
  };
};
