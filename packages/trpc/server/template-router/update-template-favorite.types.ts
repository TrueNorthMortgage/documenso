import { z } from 'zod';

export const ZUpdateTemplateFavoriteRequestSchema = z.object({
  envelopeId: z.string().min(1),
  data: z.object({ isFavorite: z.boolean() }),
});

export const ZUpdateTemplateFavoriteResponseSchema = z.object({ isFavorite: z.boolean() });
