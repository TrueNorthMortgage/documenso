import { ZEnvelopeFieldSchema } from '@documenso/lib/types/field';
import EnvelopeItemSchema from '@documenso/prisma/generated/zod/modelSchema/EnvelopeItemSchema';
import { z } from 'zod';

export const ZAddTemplateToEnvelopeRequestSchema = z.object({
  envelopeId: z.string(),
  templateId: z.number(),
  templateItemId: z.string(),
});

export const ZAddTemplateToEnvelopeResponseSchema = z.object({
  data: EnvelopeItemSchema.pick({
    id: true,
    title: true,
    envelopeId: true,
    order: true,
    documentDataId: true,
  }),
  fields: ZEnvelopeFieldSchema.array(),
});

export type TAddTemplateToEnvelopeResponse = z.infer<typeof ZAddTemplateToEnvelopeResponseSchema>;
