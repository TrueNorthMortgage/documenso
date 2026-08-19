import { FieldType } from '@prisma/client';
import { z } from 'zod';

export const ZFieldGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  // The response schema must accept the Prisma relation shape. Group creation
  // is restricted to radio/checkbox fields by the field mutation validators.
  type: z.nativeEnum(FieldType),
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
