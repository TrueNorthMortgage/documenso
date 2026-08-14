import { fromCheckboxValue } from '@documenso/lib/universal/field-checkbox';
import type { ConditionalFieldRule, Field } from '@prisma/client';
import { FieldType } from '@prisma/client';

import { ConditionalFieldRuleOperator } from '../types/conditional-field';

export type FieldWithConditionalRule = Pick<
  Field,
  'id' | 'type' | 'customText' | 'envelopeItemId' | 'recipientId' | 'fieldMeta'
> & {
  conditionalChildRule?: ConditionalFieldRule | null;
};

const normalizeText = (value: string) => value.trim().toLocaleLowerCase();

const getOptionValues = (field: FieldWithConditionalRule) => {
  if (!field.fieldMeta || typeof field.fieldMeta !== 'object' || Array.isArray(field.fieldMeta)) {
    return [];
  }

  const values = 'values' in field.fieldMeta ? field.fieldMeta.values : undefined;

  if (!Array.isArray(values)) {
    return [];
  }

  return values.flatMap((option) => {
    if (!option || typeof option !== 'object' || Array.isArray(option) || !('value' in option)) {
      return [];
    }

    return typeof option.value === 'string' ? [option.value] : [];
  });
};

const getParentValues = (field: FieldWithConditionalRule) => {
  if (field.type === FieldType.CHECKBOX) {
    const optionValues = getOptionValues(field);

    return (fromCheckboxValue(field.customText) as Array<number | string>).map((selectedValue) => {
      if (typeof selectedValue === 'number') {
        return optionValues[selectedValue] ?? String(selectedValue);
      }

      return selectedValue;
    });
  }

  if (field.type === FieldType.RADIO) {
    const optionValues = getOptionValues(field);
    const selectedIndex = Number(field.customText);

    if (field.customText !== '' && Number.isInteger(selectedIndex) && optionValues[selectedIndex] !== undefined) {
      return [optionValues[selectedIndex]];
    }
  }

  return [field.customText];
};

const matchesRule = (parent: FieldWithConditionalRule, rule: ConditionalFieldRule) => {
  const parentValues = getParentValues(parent);

  if (rule.operator === ConditionalFieldRuleOperator.ANY_TEXT) {
    return parent.type === FieldType.TEXT && parentValues.some((value) => value.trim().length > 0);
  }

  if (rule.value === null) {
    return false;
  }

  if (parent.type === FieldType.CHECKBOX) {
    return parentValues.includes(rule.value);
  }

  const expectedValue = rule.value;

  return parentValues.some((value) => value === expectedValue || normalizeText(value) === normalizeText(expectedValue));
};

export const getConditionalFieldVisibility = (fields: FieldWithConditionalRule[]) => {
  const fieldsById = new Map(fields.map((field) => [field.id, field]));
  const visibility = new Map<number, boolean>();

  for (const field of fields) {
    const rule = field.conditionalChildRule;

    if (!rule) {
      visibility.set(field.id, true);
      continue;
    }

    const parent = fieldsById.get(rule.parentFieldId);
    visibility.set(field.id, parent ? matchesRule(parent, rule) : false);
  }

  return visibility;
};

export const getHiddenConditionalFieldIds = (fields: FieldWithConditionalRule[]) => {
  const visibility = getConditionalFieldVisibility(fields);

  return fields.filter((field) => field.conditionalChildRule && !visibility.get(field.id)).map((field) => field.id);
};

export const isConditionalFieldVisible = (field: FieldWithConditionalRule, visibility: Map<number, boolean>): boolean =>
  visibility.get(field.id) ?? true;
