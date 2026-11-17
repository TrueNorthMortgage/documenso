import { z } from 'zod';

export const MAX_ACTIVITY_READ_BATCH_SIZE = 100;
export const MAX_ACTIVITY_EVENT_ID_LENGTH = 128;

export const ZLatestEnvelopeActivityCategorySchema = z.enum([
  'sent',
  'opened',
  'reminder',
  'completed',
  'declined',
  'deliveryFailure',
]);

export type LatestEnvelopeActivityCategory = z.infer<typeof ZLatestEnvelopeActivityCategorySchema>;
