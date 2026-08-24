import { FieldType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { ConditionalFieldRuleOperator } from '../types/conditional-field';
import type { TFieldGroup } from '../types/field-group';
import { getConditionalFieldVisibility } from '../universal/conditional-field-visibility';
import { fieldsContainUnsignedRequiredField } from './advanced-fields-helpers';
import {
  clearOtherRadioGroupSelections,
  getCheckboxGroupFieldValues,
  getCheckboxGroupOptions,
  getFieldsRequiringValidation,
  type TFieldWithGroup,
} from './field-groups';

const group = (type: FieldType, overrides: Partial<TFieldGroup> = {}): TFieldGroup => ({
  id: 'group-1',
  name: 'Options',
  type,
  required: true,
  readOnly: false,
  fontSize: null,
  direction: 'vertical',
  validationRule: null,
  validationLength: null,
  envelopeId: 'envelope-1',
  envelopeItemId: 'item-1',
  recipientId: 1,
  ...overrides,
});

const radioField = (id: number, inserted: boolean, customText: string, fieldGroup: TFieldGroup): TFieldWithGroup => ({
  id,
  type: FieldType.RADIO,
  fieldGroupId: fieldGroup.id,
  fieldGroup,
  inserted,
  customText,
  fieldMeta: {
    type: 'radio' as const,
    required: true,
    values: [{ id, checked: false, value: `Option ${id}` }],
  } as TFieldWithGroup['fieldMeta'],
});

const checkboxField = (
  id: number,
  inserted: boolean,
  customText: string,
  fieldGroup: TFieldGroup,
): TFieldWithGroup => ({
  id,
  type: FieldType.CHECKBOX,
  fieldGroupId: fieldGroup.id,
  fieldGroup,
  inserted,
  customText,
  fieldMeta: {
    type: 'checkbox' as const,
    required: false,
    validationRule: 'Select exactly',
    validationLength: 2,
    values: [{ id, checked: false, value: `Option ${id}` }],
  } as TFieldWithGroup['fieldMeta'],
});

describe('field groups', () => {
  it('clears other preselected radio options in the same group', () => {
    const radioGroup = group(FieldType.RADIO);
    const fields = [
      {
        formId: 'radio-1',
        fieldGroupId: radioGroup.id,
        fieldMeta: {
          type: 'radio' as const,
          direction: 'vertical' as const,
          values: [{ id: 1, checked: true, value: 'Option 1' }],
        },
      },
      {
        formId: 'radio-2',
        fieldGroupId: radioGroup.id,
        fieldMeta: {
          type: 'radio' as const,
          direction: 'vertical' as const,
          values: [{ id: 2, checked: true, value: 'Option 2' }],
        },
      },
    ];

    const updatedFields = clearOtherRadioGroupSelections(fields, fields[1]);

    expect(
      updatedFields.map((field) => (field.fieldMeta?.type === 'radio' ? field.fieldMeta.values?.[0]?.checked : null)),
    ).toEqual([false, true]);
  });

  it('treats radio options on different pages as one required field', () => {
    const radioGroup = group(FieldType.RADIO);
    const fields = [radioField(1, false, '', radioGroup), radioField(2, true, '0', radioGroup)];

    expect(getFieldsRequiringValidation(fields)).toHaveLength(0);
  });

  it('does not treat inserted required fields as unsigned', () => {
    const field = {
      id: 1,
      type: FieldType.NAME,
      fieldGroupId: null,
      inserted: true,
      customText: 'Juliano S',
      fieldMeta: null,
    } satisfies TFieldWithGroup;

    expect(fieldsContainUnsignedRequiredField([field])).toBe(false);
  });

  it('keeps initials required by default but allows them to be optional', () => {
    const field: TFieldWithGroup = {
      id: 1,
      type: FieldType.INITIALS,
      fieldGroupId: null,
      inserted: false,
      customText: '',
      fieldMeta: {
        type: 'initials',
        fontSize: 12,
        textAlign: 'left',
      },
    };

    expect(getFieldsRequiringValidation([field])).toHaveLength(1);
    expect(
      getFieldsRequiringValidation([
        {
          ...field,
          fieldMeta: {
            ...field.fieldMeta,
            required: false,
          },
        },
      ]),
    ).toHaveLength(0);
  });

  it('keeps an incomplete required radio group in validation', () => {
    const radioGroup = group(FieldType.RADIO);
    const fields = [radioField(1, false, '', radioGroup), radioField(2, false, '', radioGroup)];

    expect(getFieldsRequiringValidation(fields)).toHaveLength(1);
  });

  it('uses member required metadata instead of the legacy group flag', () => {
    const radioGroup = group(FieldType.RADIO, { required: true });
    const fields = [
      {
        ...radioField(1, false, '', radioGroup),
        fieldMeta: {
          type: 'radio' as const,
          required: false,
          values: [{ id: 1, checked: false, value: 'Option 1' }],
        },
      },
      {
        ...radioField(2, false, '', radioGroup),
        fieldMeta: {
          type: 'radio' as const,
          required: false,
          values: [{ id: 2, checked: false, value: 'Option 2' }],
        },
      },
    ] as TFieldWithGroup[];

    expect(getFieldsRequiringValidation(fields)).toHaveLength(0);
  });

  it('chooses the first group option by document position', () => {
    const radioGroup = group(FieldType.RADIO);
    const pageTwoField = { ...radioField(2, false, '', radioGroup), page: 2, positionY: 10, positionX: 5 };
    const pageOneField = { ...radioField(1, false, '', radioGroup), page: 1, positionY: 20, positionX: 5 };

    expect(getFieldsRequiringValidation([pageTwoField, pageOneField])[0]?.id).toBe(1);
  });

  it('applies checkbox count validation across group members', () => {
    const checkboxGroup = group(FieldType.CHECKBOX, {
      validationRule: 'Select exactly',
      validationLength: 2,
    });
    const fields = [
      checkboxField(1, true, '[0]', checkboxGroup),
      checkboxField(2, true, '[0]', checkboxGroup),
      checkboxField(3, false, '', checkboxGroup),
    ];

    expect(getFieldsRequiringValidation(fields)).toHaveLength(0);
  });

  it('uses checkbox validation metadata from group members', () => {
    const checkboxGroup = group(FieldType.CHECKBOX, {
      validationRule: 'Select exactly',
      validationLength: 1,
    });
    const fields = [checkboxField(1, true, '[0]', checkboxGroup), checkboxField(2, true, '[0]', checkboxGroup)];

    expect(getFieldsRequiringValidation(fields)).toHaveLength(0);
  });

  it('flattens grouped checkbox options across pages and restores selections per field', () => {
    const checkboxGroup = group(FieldType.CHECKBOX, {
      validationRule: 'Select exactly',
      validationLength: 2,
    });
    const fields = [
      { ...checkboxField(2, true, '[0]', checkboxGroup), page: 2, positionY: 10, positionX: 5 },
      { ...checkboxField(1, false, '', checkboxGroup), page: 1, positionY: 20, positionX: 5 },
      {
        ...checkboxField(3, false, '', checkboxGroup),
        page: 2,
        positionY: 20,
        positionX: 5,
        fieldMeta: {
          type: 'checkbox' as const,
          values: [
            { id: 3, checked: false, value: 'Option 3' },
            { id: 4, checked: false, value: 'Option 4' },
          ],
        },
      },
    ] as TFieldWithGroup[];

    expect(getCheckboxGroupOptions(fields)).toEqual([
      { fieldId: 1, fieldValueIndex: 0, value: 'Option 1', selected: false },
      { fieldId: 2, fieldValueIndex: 0, value: 'Option 2', selected: true },
      { fieldId: 3, fieldValueIndex: 0, value: 'Option 3', selected: false },
      { fieldId: 3, fieldValueIndex: 1, value: 'Option 4', selected: false },
    ]);

    expect(getCheckboxGroupFieldValues(fields, [0, 3])).toEqual([
      { fieldId: 1, value: [0] },
      { fieldId: 2, value: [] },
      { fieldId: 3, value: [1] },
    ]);
  });

  it('does not require every checkbox option when the group only requires one selection', () => {
    const checkboxGroup = group(FieldType.CHECKBOX, {
      validationRule: null,
      validationLength: null,
    });
    const fields = [
      {
        ...checkboxField(1, true, '[0]', checkboxGroup),
        fieldMeta: {
          type: 'checkbox' as const,
          required: true,
          values: [{ id: 1, checked: false, value: 'Option 1' }],
        },
      },
      {
        ...checkboxField(2, false, '', checkboxGroup),
        fieldMeta: {
          type: 'checkbox' as const,
          required: true,
          values: [{ id: 2, checked: false, value: 'Option 2' }],
        },
      },
      {
        ...checkboxField(3, false, '', checkboxGroup),
        fieldMeta: {
          type: 'checkbox' as const,
          required: true,
          values: [{ id: 3, checked: false, value: 'Option 3' }],
        },
      },
    ];

    expect(getFieldsRequiringValidation(fields)).toHaveLength(0);
  });

  it('uses selections from every group member for conditional fields', () => {
    const radioGroup = group(FieldType.RADIO);
    const selectedField = {
      ...radioField(2, true, '0', radioGroup),
      envelopeItemId: 'item-1',
      recipientId: 1,
    };
    const child = {
      id: 10,
      type: FieldType.TEXT,
      fieldGroupId: null,
      inserted: false,
      customText: '',
      fieldMeta: { type: 'text' as const },
      envelopeItemId: 'item-1',
      recipientId: 1,
      conditionalChildRule: {
        id: 1,
        childFieldId: 10,
        parentFieldId: 2,
        operator: ConditionalFieldRuleOperator.EQUALS,
        value: 'Option 2',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };

    const visibility = getConditionalFieldVisibility([
      {
        ...radioField(1, false, '', radioGroup),
        envelopeItemId: 'item-1',
        recipientId: 1,
      },
      selectedField,
      child,
    ]);

    expect(visibility.get(child.id)).toBe(true);
  });
});
