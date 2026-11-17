import { z } from 'zod';

export const ZGetEnvelopeActivityNotificationsRequestSchema = z.object({
  teamId: z.number().int().positive(),
});

export const ZGetEnvelopeActivityNotificationsResponseSchema = z.object({
  count: z.number(),
});
