import { ZEnvelopeLiteSchema } from '@documenso/lib/types/envelope';
import { z } from 'zod';

import type { TrpcRouteMeta } from '../trpc';

export const startEnvelopeCorrectionMeta: TrpcRouteMeta = {
  openapi: {
    method: 'POST',
    path: '/envelope/correction/start',
    summary: 'Start correcting an envelope',
    tags: ['Envelope'],
  },
};

export const ZStartEnvelopeCorrectionRequestSchema = z.object({
  envelopeId: z.string(),
});

export const ZStartEnvelopeCorrectionResponseSchema = ZEnvelopeLiteSchema;

export type TStartEnvelopeCorrectionRequest = z.infer<typeof ZStartEnvelopeCorrectionRequestSchema>;
export type TStartEnvelopeCorrectionResponse = z.infer<typeof ZStartEnvelopeCorrectionResponseSchema>;
