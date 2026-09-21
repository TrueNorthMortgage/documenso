import { z } from 'zod';

import { ZSuccessResponseSchema } from '../schema';
import type { TrpcRouteMeta } from '../trpc';

export const cancelScheduledSendMeta: TrpcRouteMeta = {
  openapi: {
    method: 'POST',
    path: '/envelope/cancel-scheduled-send',
    summary: 'Cancel scheduled envelope send',
    tags: ['Envelope'],
  },
};

export const ZCancelScheduledSendRequestSchema = z.object({ envelopeId: z.string() });
export const ZCancelScheduledSendResponseSchema = ZSuccessResponseSchema;
