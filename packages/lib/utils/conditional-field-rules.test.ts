import { describe, expect, it } from 'vitest';

import { ConditionalFieldRuleOperator, type TConditionalFieldRule } from '../types/conditional-field';
import { removeConditionalRulesForDeletedFields } from './conditional-field-rules';

const rule = (id: number, parentFieldId: number, childFieldId: number): TConditionalFieldRule => ({
  id,
  parentFieldId,
  childFieldId,
  operator: ConditionalFieldRuleOperator.EQUALS,
  value: 'Option 1',
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('removeConditionalRulesForDeletedFields', () => {
  it('removes only rules connected to a deleted child field', () => {
    const firstRule = rule(10, 1, 2);
    const secondRule = rule(11, 1, 20);
    const fields = [
      { id: 1, conditionalParentRules: [firstRule, secondRule] },
      { id: 2, conditionalChildRule: firstRule },
      { id: 20, conditionalChildRule: secondRule },
    ];

    const cleanedFields = removeConditionalRulesForDeletedFields(fields, new Set([2]));

    expect(cleanedFields[0]?.conditionalParentRules).toEqual([secondRule]);
    expect(cleanedFields[1]?.conditionalChildRule).toBeNull();
    expect(cleanedFields[2]?.conditionalChildRule).toEqual(secondRule);
  });

  it('clears child references when a conditional parent field is deleted', () => {
    const conditionalRule = rule(10, 1, 2);
    const fields = [
      { id: 1, conditionalParentRules: [conditionalRule] },
      { id: 2, conditionalChildRule: conditionalRule },
    ];

    const cleanedFields = removeConditionalRulesForDeletedFields(fields, new Set([1]));

    expect(cleanedFields[0]?.conditionalParentRules).toEqual([]);
    expect(cleanedFields[1]?.conditionalChildRule).toBeNull();
  });

  it('does not match partial or unrelated field IDs', () => {
    const unrelatedRule = rule(10, 12, 20);
    const fields = [
      { id: 12, conditionalParentRules: [unrelatedRule] },
      { id: 20, conditionalChildRule: unrelatedRule },
    ];

    const cleanedFields = removeConditionalRulesForDeletedFields(fields, new Set([2]));

    expect(cleanedFields).toEqual(fields);
  });
});
