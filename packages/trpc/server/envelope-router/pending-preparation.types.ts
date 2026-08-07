import { z } from 'zod';
import type { TrpcRouteMeta } from '../trpc';
import { ZCreateEnvelopeRequestSchema } from './create-envelope.types';

export const pendingPreparationMeta: TrpcRouteMeta = {
  openapi: {
    method: 'POST',
    path: '/envelope/pending-prepare',
    contentTypes: ['multipart/form-data'],
    summary: 'Prepare an envelope for authenticated commit',
    description: 'Store uploaded files without creating an envelope until the actor signs in.',
    tags: ['Envelope'],
  },
};

export const ZPendingPreparationRequestSchema = ZCreateEnvelopeRequestSchema;

export const ZPendingPreparationResponseSchema = z.object({
  id: z.string(),
  continuationUrl: z.string().url(),
  expiresAt: z.string().datetime(),
});
