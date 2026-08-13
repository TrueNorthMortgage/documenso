import { z } from 'zod';

export const ConditionalFieldRuleOperator = {
  EQUALS: 'EQUALS',
  ANY_TEXT: 'ANY_TEXT',
} as const;

export const ZConditionalFieldRuleOperatorSchema = z.enum([
  ConditionalFieldRuleOperator.EQUALS,
  ConditionalFieldRuleOperator.ANY_TEXT,
]);

export type ConditionalFieldRuleOperator = z.infer<typeof ZConditionalFieldRuleOperatorSchema>;

export const ZConditionalFieldRuleSchema = z.object({
  id: z.number(),
  childFieldId: z.number(),
  parentFieldId: z.number(),
  operator: ZConditionalFieldRuleOperatorSchema,
  value: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type TConditionalFieldRule = z.infer<typeof ZConditionalFieldRuleSchema>;
