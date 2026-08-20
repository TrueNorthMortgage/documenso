import { FieldType } from '@prisma/client';

import { getFieldsRequiringValidation, type TFieldWithGroup } from './field-groups';

export { getFieldsRequiringValidation, isFieldUnsignedAndRequired, isRequiredField } from './field-groups';

// Field types that expose optional field metadata in the editor.
export const ADVANCED_FIELD_TYPES_WITH_OPTIONAL_SETTING: FieldType[] = [
  FieldType.NUMBER,
  FieldType.TEXT,
  FieldType.DROPDOWN,
  FieldType.RADIO,
  FieldType.CHECKBOX,
];

/**
 * Whether the provided fields contains a field that is required to be inserted.
 */
export const fieldsContainUnsignedRequiredField = <T extends TFieldWithGroup>(fields: T[]) =>
  getFieldsRequiringValidation(fields).some((field) => !field.inserted);
