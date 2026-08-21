import type { ConditionalFieldRule } from '@prisma/client';
import { FieldType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { ConditionalFieldRuleOperator } from '../types/conditional-field';
import {
  type FieldWithConditionalRule,
  getConditionalFieldVisibility,
  getHiddenConditionalFieldIds,
} from './conditional-field-visibility';

const field = (
  id: number,
  type: FieldType,
  customText = '',
  parentFieldId?: number,
  fieldMeta?: FieldWithConditionalRule['fieldMeta'],
  envelopeInternalVersion?: number,
): FieldWithConditionalRule => ({
  id,
  type,
  customText,
  envelopeItemId: 'item-1',
  recipientId: 1,
  fieldMeta: fieldMeta ?? null,
  envelopeInternalVersion,
  conditionalChildRule:
    parentFieldId === undefined
      ? null
      : {
          id: id + 100,
          childFieldId: id,
          parentFieldId,
          operator: ConditionalFieldRuleOperator.EQUALS,
          value: 'Yes',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
});

const childWithRule = (
  id: number,
  parentFieldId: number,
): FieldWithConditionalRule & { conditionalChildRule: ConditionalFieldRule } => {
  const child = field(id, FieldType.TEXT, '', parentFieldId);
  const childRule = child.conditionalChildRule;

  if (!childRule) {
    throw new Error('Expected a conditional child rule');
  }

  return { ...child, conditionalChildRule: childRule };
};

describe('getConditionalFieldVisibility', () => {
  it('shows a child when a radio parent matches', () => {
    const visibility = getConditionalFieldVisibility([
      field(1, FieldType.RADIO, '0', undefined, {
        type: 'radio',
        direction: 'vertical',
        values: [
          { id: 1, value: 'Yes', checked: false },
          { id: 2, value: 'No', checked: false },
        ],
      }),
      field(2, FieldType.TEXT, '', 1),
    ]);

    expect(visibility.get(2)).toBe(true);
  });

  it('uses a generated value for a blank radio option', () => {
    const child = childWithRule(2, 1);
    child.conditionalChildRule.value = 'Option 2';

    const visibility = getConditionalFieldVisibility([
      field(1, FieldType.RADIO, '1', undefined, {
        type: 'radio',
        direction: 'vertical',
        values: [
          { id: 1, value: 'Visible', checked: false },
          { id: 2, value: '', checked: false },
        ],
      }),
      child,
    ]);

    expect(visibility.get(2)).toBe(true);
  });

  it('maps checkbox indexes to configured option values', () => {
    const child = childWithRule(2, 1);
    child.conditionalChildRule.value = 'Two';

    const visibility = getConditionalFieldVisibility([
      field(1, FieldType.CHECKBOX, '[1]', undefined, {
        type: 'checkbox',
        direction: 'vertical',
        values: [
          { id: 1, value: 'One', checked: false },
          { id: 2, value: 'Two', checked: false },
        ],
      }),
      child,
    ]);

    expect(visibility.get(2)).toBe(true);
  });

  it('maps grouped checkbox indexes to each field values', () => {
    const firstField = {
      ...field(1, FieldType.CHECKBOX, '[1]', undefined, {
        type: 'checkbox',
        direction: 'vertical',
        values: [
          { id: 1, value: 'A1', checked: false },
          { id: 2, value: 'A2', checked: false },
        ],
      }),
      fieldGroupId: 'group-1',
      fieldGroup: { type: FieldType.CHECKBOX },
      inserted: true,
    };
    const secondField = {
      ...field(3, FieldType.CHECKBOX, '[0]', undefined, {
        type: 'checkbox',
        direction: 'vertical',
        values: [{ id: 3, value: 'B1', checked: false }],
      }),
      fieldGroupId: 'group-1',
      fieldGroup: { type: FieldType.CHECKBOX },
      inserted: true,
    };
    const child = childWithRule(2, 1);
    child.conditionalChildRule.value = 'B1';

    const visibility = getConditionalFieldVisibility([firstField, secondField, child]);

    expect(visibility.get(2)).toBe(true);
  });

  it('matches numeric radio labels in legacy envelopes', () => {
    const child = childWithRule(2, 1);
    child.conditionalChildRule.value = '2';

    const visibility = getConditionalFieldVisibility([
      field(
        1,
        FieldType.RADIO,
        '2',
        undefined,
        {
          type: 'radio',
          direction: 'vertical',
          values: [
            { id: 1, value: '1', checked: false },
            { id: 2, value: '2', checked: false },
            { id: 3, value: '3', checked: false },
          ],
        },
        1,
      ),
      child,
    ]);

    expect(visibility.get(2)).toBe(true);
  });

  it('matches numeric radio labels stored as indexes in V2 envelopes', () => {
    const child = childWithRule(2, 1);
    child.conditionalChildRule.value = '3';

    const visibility = getConditionalFieldVisibility([
      field(
        1,
        FieldType.RADIO,
        '2',
        undefined,
        {
          type: 'radio',
          direction: 'vertical',
          values: [
            { id: 1, value: '1', checked: false },
            { id: 2, value: '2', checked: false },
            { id: 3, value: '3', checked: false },
          ],
        },
        2,
      ),
      child,
    ]);

    expect(visibility.get(2)).toBe(true);
  });

  it('hides a child when a dropdown parent does not match', () => {
    const visibility = getConditionalFieldVisibility([
      field(1, FieldType.DROPDOWN, 'No'),
      field(2, FieldType.TEXT, '', 1),
    ]);

    expect(visibility.get(2)).toBe(false);
  });

  it('matches a selected checkbox option', () => {
    const checkbox = field(1, FieldType.CHECKBOX, JSON.stringify(['Other']));
    const child = childWithRule(2, 1);
    child.conditionalChildRule.value = 'Other';

    const visibility = getConditionalFieldVisibility([checkbox, child]);

    expect(visibility.get(2)).toBe(true);
  });

  it('matches text case-insensitively and trims whitespace', () => {
    const parent = field(1, FieldType.TEXT, ' Self-Employed ');
    const child = childWithRule(2, 1);
    child.conditionalChildRule.value = 'self-employed';

    const visibility = getConditionalFieldVisibility([parent, child]);

    expect(visibility.get(2)).toBe(true);
  });

  it('matches any non-empty text', () => {
    const parent = field(1, FieldType.TEXT, 'Details');
    const child = childWithRule(2, 1);
    child.conditionalChildRule.operator = ConditionalFieldRuleOperator.ANY_TEXT;
    child.conditionalChildRule.value = null;

    const visibility = getConditionalFieldVisibility([parent, child]);

    expect(visibility.get(2)).toBe(true);
  });

  it('hides children when the parent is unanswered', () => {
    const visibility = getConditionalFieldVisibility([field(1, FieldType.TEXT), field(2, FieldType.TEXT, '', 1)]);

    expect(visibility.get(2)).toBe(false);
  });

  it('hides a child when its parent is missing', () => {
    const visibility = getConditionalFieldVisibility([field(2, FieldType.TEXT, '', 99)]);

    expect(visibility.get(2)).toBe(false);
  });

  it('returns hidden child fields for cleanup', () => {
    const hiddenChild = childWithRule(2, 1);
    hiddenChild.conditionalChildRule.value = 'No';

    expect(
      getHiddenConditionalFieldIds([
        field(1, FieldType.RADIO, '0', undefined, {
          type: 'radio',
          direction: 'vertical',
          values: [
            { id: 1, value: 'Yes', checked: false },
            { id: 2, value: 'No', checked: false },
          ],
        }),
        hiddenChild,
      ]),
    ).toEqual([2]);
  });
});
