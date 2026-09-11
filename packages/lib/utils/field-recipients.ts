type FieldWithRecipientGroup = {
  formId: string;
  fieldGroupId: string | null;
};

export const getFieldFormIdsForRecipientUpdate = <T extends FieldWithRecipientGroup>(
  fields: T[],
  selectedFormIds: string[],
) => {
  const selectedFieldIds = new Set(selectedFormIds);
  const selectedGroupIds = new Set(
    fields
      .filter((field) => selectedFieldIds.has(field.formId) && field.fieldGroupId)
      .map((field) => field.fieldGroupId),
  );

  return fields
    .filter(
      (field) => selectedFieldIds.has(field.formId) || (field.fieldGroupId && selectedGroupIds.has(field.fieldGroupId)),
    )
    .map((field) => field.formId);
};
