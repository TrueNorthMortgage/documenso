import { FieldType } from '@prisma/client';
import { z } from 'zod';

export const FIELD_GROUP_TYPE = {
  OPTION_GROUP: 'OPTION_GROUP',
  VALIDATION_GROUP: 'VALIDATION_GROUP',
} as const;

export const ZFieldGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  // The response schema must accept the Prisma relation shape. Group creation
  // is restricted by the field mutation validators.
  type: z.nativeEnum(FieldType),
  groupType: z.enum([FIELD_GROUP_TYPE.OPTION_GROUP, FIELD_GROUP_TYPE.VALIDATION_GROUP]),
  required: z.boolean(),
  readOnly: z.boolean(),
  fontSize: z.number().nullable(),
  direction: z.string().nullable(),
  validationRule: z.string().nullable(),
  validationLength: z.number().nullable(),
  envelopeId: z.string(),
  envelopeItemId: z.string(),
  recipientId: z.number(),
});

export const ZFieldGroupInputSchema = ZFieldGroupSchema.pick({
  id: true,
  name: true,
  type: true,
});

export type TFieldGroup = z.infer<typeof ZFieldGroupSchema>;
export type TFieldGroupInput = z.infer<typeof ZFieldGroupInputSchema>;
