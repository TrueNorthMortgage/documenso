import { z } from 'zod';

export const ZDeletePersonalEmailMessageRequestSchema = z.object({
  teamId: z.number().int(),
  id: z.string(),
});
