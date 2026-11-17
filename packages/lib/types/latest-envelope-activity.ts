import { z } from 'zod';

export const ZLatestEnvelopeActivityCategorySchema = z.enum([
  'sent',
  'opened',
  'reminder',
  'completed',
  'declined',
  'deliveryFailure',
]);

export type LatestEnvelopeActivityCategory = z.infer<typeof ZLatestEnvelopeActivityCategorySchema>;
