import { z } from 'zod';
import type { TrpcRouteMeta } from '../trpc';
import { ZCreateDocumentFromTemplateRequestSchema } from './schema';

export const pendingTemplatePreparationMeta: TrpcRouteMeta = {
  openapi: {
    method: 'POST',
    path: '/template/pending-prepare',
    summary: 'Prepare a template document for authenticated commit',
    description: 'Store template request data without creating a document until the actor signs in.',
    tags: ['Template'],
  },
};

export const ZPendingTemplatePreparationRequestSchema = ZCreateDocumentFromTemplateRequestSchema;

export const ZPendingTemplatePreparationResponseSchema = z.object({
  id: z.string(),
  continuationUrl: z.string().url(),
  expiresAt: z.string().datetime(),
});
