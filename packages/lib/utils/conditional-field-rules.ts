import type { TConditionalFieldRule } from '../types/conditional-field';

type TConditionalRuleField = {
  id?: number;
  conditionalChildRule?: TConditionalFieldRule | null;
  conditionalParentRules?: TConditionalFieldRule[];
};

/**
 * Removes conditional rule references connected to fields that are about to be deleted.
 *
 * The field array contains both sides of a rule, so deleting a field must clear the
 * child reference and the parent's cached rule entry. Matching both IDs also handles
 * deleting a parent field without affecting unrelated conditional rules.
 */
export const removeConditionalRulesForDeletedFields = <T extends TConditionalRuleField>(
  fields: T[],
  deletedFieldIds: ReadonlySet<number>,
): T[] => {
  if (deletedFieldIds.size === 0) {
    return fields;
  }

  const deletedRuleIds = new Set<number>();

  for (const field of fields) {
    const rules = [
      ...(field.conditionalChildRule ? [field.conditionalChildRule] : []),
      ...(field.conditionalParentRules ?? []),
    ];

    for (const rule of rules) {
      if (deletedFieldIds.has(rule.childFieldId) || deletedFieldIds.has(rule.parentFieldId)) {
        deletedRuleIds.add(rule.id);
      }
    }
  }

  if (deletedRuleIds.size === 0) {
    return fields;
  }

  return fields.map((field) => ({
    ...field,
    conditionalChildRule:
      field.conditionalChildRule && deletedRuleIds.has(field.conditionalChildRule.id)
        ? null
        : field.conditionalChildRule,
    conditionalParentRules: field.conditionalParentRules?.filter((rule) => !deletedRuleIds.has(rule.id)),
  }));
};
