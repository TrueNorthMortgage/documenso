import { z } from 'zod';

export const ZCountNewEnvelopeActivityRequestSchema = z.object({
  teamId: z.number().int().positive(),
  seenThrough: z.date().optional(),
});

export const ZCountNewEnvelopeActivityResponseSchema = z.object({
  count: z.number(),
});
