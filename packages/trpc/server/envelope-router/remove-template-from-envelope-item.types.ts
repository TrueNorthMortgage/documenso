import { ZEnvelopeFieldSchema } from '@documenso/lib/types/field';
import { z } from 'zod';

export const ZRemoveTemplateFromEnvelopeItemRequestSchema = z.object({
  envelopeId: z.string(),
  envelopeItemId: z.string(),
});

export const ZRemoveTemplateFromEnvelopeItemResponseSchema = z.object({
  data: ZEnvelopeFieldSchema.array(),
});
