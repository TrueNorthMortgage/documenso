import { fromCheckboxValue } from '@documenso/lib/universal/field-checkbox';
import type { Field, FieldType } from '@prisma/client';

import type { TFieldGroup } from '../types/field-group';

export type TFieldWithGroup = Pick<Field, 'id' | 'type' | 'fieldGroupId' | 'inserted' | 'customText' | 'fieldMeta'> &
  Partial<Pick<Field, 'page' | 'positionX' | 'positionY'>> & {
    fieldGroup?: TFieldGroup | null;
  };

export const getFieldGroupFields = <T extends TFieldWithGroup>(fields: T[], groupId: string): T[] =>
  fields.filter((field) => field.fieldGroupId === groupId);

const getSelectedOptionCount = (fields: TFieldWithGroup[]) => {
  return fields.reduce((count, field) => {
    if (!field.inserted) {
      return count;
    }

    if (field.type === 'CHECKBOX') {
      return count + fromCheckboxValue(field.customText).length;
    }

    return count + (field.customText !== '' ? 1 : 0);
  }, 0);
};

const getGroupValidation = (fields: TFieldWithGroup[], group: TFieldGroup) => {
  const fieldMetas = fields.flatMap((field) => {
    if (!field.fieldMeta || typeof field.fieldMeta !== 'object' || Array.isArray(field.fieldMeta)) {
      return [];
    }

    return [field.fieldMeta as Record<string, unknown>];
  });

  const hasMemberRequiredValue = fieldMetas.some((meta) => 'required' in meta);
  const checkboxMeta = fieldMetas.find((meta) => meta.type === 'checkbox');
  const hasMemberValidation = fieldMetas.some((meta) => 'validationRule' in meta || 'validationLength' in meta);

  return {
    required: hasMemberRequiredValue ? fieldMetas.some((meta) => meta.required === true) : group.required,
    validationRule: hasMemberValidation
      ? typeof checkboxMeta?.validationRule === 'string'
        ? checkboxMeta.validationRule || null
        : null
      : group.validationRule,
    validationLength: hasMemberValidation
      ? typeof checkboxMeta?.validationLength === 'number'
        ? checkboxMeta.validationLength || null
        : null
      : group.validationLength,
  };
};

const sortByDocumentPosition = <T extends TFieldWithGroup>(fields: T[]): T[] => {
  return [...fields].sort((left, right) => {
    const pageDifference = (left.page ?? 0) - (right.page ?? 0);

    if (pageDifference !== 0) {
      return pageDifference;
    }

    const positionYDifference = Number(left.positionY ?? 0) - Number(right.positionY ?? 0);

    if (positionYDifference !== 0) {
      return positionYDifference;
    }

    return Number(left.positionX ?? 0) - Number(right.positionX ?? 0);
  });
};

export const isFieldGroupComplete = (fields: TFieldWithGroup[], group: TFieldGroup): boolean => {
  const selectedOptionCount = getSelectedOptionCount(fields);
  const { required, validationRule, validationLength } = getGroupValidation(fields, group);

  if (group.type === 'RADIO') {
    return selectedOptionCount <= 1 && (!required || selectedOptionCount > 0);
  }

  if (required && selectedOptionCount === 0) {
    return false;
  }

  if (!validationRule || !validationLength) {
    return true;
  }

  switch (validationRule) {
    case 'Select exactly':
      return selectedOptionCount === validationLength;
    case 'Select at least':
      return selectedOptionCount >= validationLength;
    case 'Select at most':
      return selectedOptionCount <= validationLength;
    default:
      return true;
  }
};

/**
 * Returns one representative field for each incomplete required group. This
 * keeps existing navigation and validation UIs working without showing every
 * option as a separate required field.
 */
export const getFieldsRequiringValidation = <T extends TFieldWithGroup>(fields: T[]): T[] => {
  const fieldsToValidate = fields.filter((field) => !field.fieldGroupId && isRequiredField(field));
  const groups = new Map<string, T[]>();

  for (const field of fields) {
    if (!field.fieldGroupId || !field.fieldGroup) {
      continue;
    }

    const groupFields = groups.get(field.fieldGroupId) ?? [];
    groupFields.push(field);
    groups.set(field.fieldGroupId, groupFields);
  }

  for (const groupFields of groups.values()) {
    const group = groupFields[0]?.fieldGroup;
    const groupValidation = group ? getGroupValidation(groupFields, group) : null;

    if (
      group &&
      groupValidation &&
      !isFieldGroupComplete(groupFields, group) &&
      (groupValidation.required || groupValidation.validationRule || groupValidation.validationLength)
    ) {
      fieldsToValidate.push(
        sortByDocumentPosition(groupFields.filter((field) => !field.inserted))[0] ?? groupFields[0],
      );
    }
  }

  return fieldsToValidate;
};

export const isRequiredField = (field: TFieldWithGroup) => {
  if (field.fieldGroupId) {
    return false;
  }

  // All fields without the optional metadata are assumed to be required.
  const optionalFieldTypes: FieldType[] = ['NUMBER', 'TEXT', 'DROPDOWN', 'RADIO', 'CHECKBOX'];

  if (!optionalFieldTypes.includes(field.type)) {
    return true;
  }

  if (!field.fieldMeta || typeof field.fieldMeta !== 'object' || Array.isArray(field.fieldMeta)) {
    return false;
  }

  return 'required' in field.fieldMeta && field.fieldMeta.required === true;
};

export const isFieldUnsignedAndRequired = (field: TFieldWithGroup) => isRequiredField(field) && !field.inserted;
