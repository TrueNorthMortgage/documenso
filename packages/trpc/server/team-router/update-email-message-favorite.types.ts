import { z } from 'zod';

export const ZUpdateEmailMessageFavoriteRequestSchema = z.object({
  teamId: z.number().int(),
  id: z.string(),
  data: z.object({ isFavorite: z.boolean() }),
});
