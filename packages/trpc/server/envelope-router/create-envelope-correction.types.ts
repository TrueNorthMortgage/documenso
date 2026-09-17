import { z } from 'zod';

import type { TrpcRouteMeta } from '../trpc';

export const createEnvelopeCorrectionMeta: TrpcRouteMeta = {
  openapi: {
    method: 'POST',
    path: '/envelope/correction/create',
    summary: 'Create a corrected copy of a partially completed envelope',
    tags: ['Envelope'],
  },
};

export const ZCreateEnvelopeCorrectionRequestSchema = z.object({
  envelopeId: z.string(),
});

export const ZCreateEnvelopeCorrectionResponseSchema = z.object({
  id: z.string(),
});

export type TCreateEnvelopeCorrectionRequest = z.infer<typeof ZCreateEnvelopeCorrectionRequestSchema>;
export type TCreateEnvelopeCorrectionResponse = z.infer<typeof ZCreateEnvelopeCorrectionResponseSchema>;
