import { z } from 'zod';

export const ZGetTemplateBySourceItemIdRequestSchema = z.object({
  envelopeItemId: z.string(),
});

export const ZGetTemplateBySourceItemIdResponseSchema = z
  .object({
    envelopeId: z.string(),
    title: z.string(),
  })
  .nullable();
