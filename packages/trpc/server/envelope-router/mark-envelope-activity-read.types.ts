import {
  MAX_ACTIVITY_EVENT_ID_LENGTH,
  MAX_ACTIVITY_READ_BATCH_SIZE,
} from '@documenso/lib/types/latest-envelope-activity';
import { z } from 'zod';

export const ZMarkEnvelopeActivityReadRequestSchema = z.object({
  teamId: z.number().int().positive(),
  eventIds: z.array(z.string().min(1).max(MAX_ACTIVITY_EVENT_ID_LENGTH)).min(1).max(MAX_ACTIVITY_READ_BATCH_SIZE),
});

export const ZMarkEnvelopeActivityReadResponseSchema = z.object({
  success: z.boolean(),
});
