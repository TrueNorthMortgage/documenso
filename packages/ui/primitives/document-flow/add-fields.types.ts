import { ZConditionalFieldRuleSchema } from '@documenso/lib/types/conditional-field';
import { ZFieldMetaSchema } from '@documenso/lib/types/field-meta';
import { FieldType } from '@prisma/client';
import { z } from 'zod';

export const ZAddFieldsFormSchema = z.object({
  fields: z.array(
    z.object({
      formId: z.string().min(1),
      nativeId: z.number().optional(),
      envelopeItemId: z.string().optional(),
      type: z.nativeEnum(FieldType),
      signerEmail: z.string().min(1),
      recipientId: z.number().min(1),
      pageNumber: z.number().min(1),
      pageX: z.number().min(0),
      pageY: z.number().min(0),
      pageWidth: z.number().min(0),
      pageHeight: z.number().min(0),
      fieldMeta: ZFieldMetaSchema,
      conditionalChildRule: ZConditionalFieldRuleSchema.nullable().optional(),
      conditionalParentRules: ZConditionalFieldRuleSchema.array().optional(),
    }),
  ),
});

export type TAddFieldsFormSchema = z.infer<typeof ZAddFieldsFormSchema>;
