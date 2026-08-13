import { ZEnvelopeFieldSchema } from '@documenso/lib/types/field';
import { z } from 'zod';

export const ZApplyTemplateToEnvelopeItemRequestSchema = z.object({
  envelopeId: z.string(),
  envelopeItemId: z.string(),
  templateId: z.number(),
  templateItemId: z.string(),
  replaceExistingFields: z.boolean(),
});

export const ZApplyTemplateToEnvelopeItemResponseSchema = z.object({
  data: ZEnvelopeFieldSchema.array(),
});
