import type { FieldType } from '@prisma/client';

type IdentityField = {
  type: FieldType;
  recipientId: number | null;
  inserted: boolean;
  customText: string;
  fieldMeta?: { readOnly?: boolean } | null;
  fieldGroup?: { readOnly?: boolean } | null;
};

export const getFilledIdentityFieldsToUpdate = <T extends IdentityField>(
  fields: T[],
  recipientId: number,
  type: typeof FieldType.NAME | typeof FieldType.INITIALS,
  value: string,
): T[] => {
  return fields.filter(
    (field) =>
      field.recipientId === recipientId &&
      field.type === type &&
      field.inserted &&
      field.customText !== value &&
      !field.fieldMeta?.readOnly &&
      !field.fieldGroup?.readOnly,
  );
};
