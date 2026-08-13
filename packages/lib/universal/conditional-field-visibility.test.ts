import type { ConditionalFieldRule } from '@prisma/client';
import { FieldType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { ConditionalFieldRuleOperator } from '../types/conditional-field';
import { type FieldWithConditionalRule, getConditionalFieldVisibility } from './conditional-field-visibility';

const field = (id: number, type: FieldType, customText = '', parentFieldId?: number): FieldWithConditionalRule => ({
  id,
  type,
  customText,
  envelopeItemId: 'item-1',
  recipientId: 1,
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
      field(1, FieldType.RADIO, 'Yes'),
      field(2, FieldType.TEXT, '', 1),
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
});
