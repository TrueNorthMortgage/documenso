import { fromCheckboxValue } from '@documenso/lib/universal/field-checkbox';
import type { Field, FieldType } from '@prisma/client';

import type { TFieldGroup } from '../types/field-group';
import type { TFieldMetaSchema } from '../types/field-meta';

export type TFieldWithGroup = Pick<Field, 'id' | 'type' | 'fieldGroupId' | 'inserted' | 'customText' | 'fieldMeta'> &
  Partial<Pick<Field, 'page' | 'positionX' | 'positionY'>> & {
    fieldGroup?: TFieldGroup | null;
  };

export type TCheckboxGroupOption = {
  fieldId: number;
  fieldValueIndex: number;
  value: string;
  selected: boolean;
};

export const getFieldGroupFields = <T extends TFieldWithGroup>(fields: T[], groupId: string): T[] =>
  fields.filter((field) => field.fieldGroupId === groupId);

type TRadioGroupSelectionField = {
  formId: string;
  fieldGroupId: string | null;
  fieldMeta?: TFieldMetaSchema;
};

export const clearOtherRadioGroupSelections = <T extends TRadioGroupSelectionField>(
  fields: T[],
  selectedField: TRadioGroupSelectionField,
): T[] => {
  const selectedRadioMeta = selectedField.fieldMeta;
  const hasSelectedValue =
    selectedField.fieldGroupId &&
    selectedRadioMeta?.type === 'radio' &&
    selectedRadioMeta.values?.some((value) => value.checked);

  if (!hasSelectedValue) {
    return fields;
  }

  return fields.map((candidate) => {
    if (
      candidate.formId === selectedField.formId ||
      candidate.fieldGroupId !== selectedField.fieldGroupId ||
      candidate.fieldMeta?.type !== 'radio'
    ) {
      return candidate;
    }

    return {
      ...candidate,
      fieldMeta: {
        ...candidate.fieldMeta,
        values: candidate.fieldMeta.values?.map((value) => ({
          ...value,
          checked: false,
        })),
      },
    };
  });
};

const getCheckboxFieldValues = (field: TFieldWithGroup) => {
  if (!field.fieldMeta || typeof field.fieldMeta !== 'object' || Array.isArray(field.fieldMeta)) {
    return [];
  }

  const values = (field.fieldMeta as { values?: unknown }).values;

  if (!Array.isArray(values)) {
    return [];
  }

  return values.flatMap((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.value !== 'string') {
      return [];
    }

    return [value.value];
  });
};

/**
 * Flattens grouped checkbox fields into the option list shown to a signer.
 * Each grouped field normally owns one option, but this also supports legacy
 * grouped fields that still contain multiple values.
 */
export const getCheckboxGroupOptions = (fields: TFieldWithGroup[]): TCheckboxGroupOption[] => {
  return sortByDocumentPosition(fields)
    .filter((field) => field.type === 'CHECKBOX')
    .flatMap((field) => {
      const selectedValues = new Set(fromCheckboxValue(field.customText).map((value) => Number(value)));

      return getCheckboxFieldValues(field).map((value, fieldValueIndex) => ({
        fieldId: field.id,
        fieldValueIndex,
        value,
        selected: selectedValues.has(fieldValueIndex),
      }));
    });
};

export const getCheckboxGroupFieldValues = (
  fields: TFieldWithGroup[],
  selectedOptionIndices: number[],
): Array<{ fieldId: number; value: number[] }> => {
  const selectedOptions = new Set(selectedOptionIndices);
  let optionIndex = 0;

  return sortByDocumentPosition(fields)
    .filter((field) => field.type === 'CHECKBOX')
    .map((field) => {
      const fieldValues = getCheckboxFieldValues(field);
      const value = fieldValues.flatMap((_fieldValue, fieldValueIndex) => {
        const isSelected = selectedOptions.has(optionIndex);
        optionIndex += 1;

        return isSelected ? [fieldValueIndex] : [];
      });

      return { fieldId: field.id, value };
    });
};

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
