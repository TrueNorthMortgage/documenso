import { z } from 'zod';

export const ZFindEmailMessagesRequestSchema = z.object({
  teamId: z.number().int(),
  query: z.string().trim().max(255).default(''),
  teamOnly: z.boolean().default(false),
});
