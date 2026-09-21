import { ZDocumentMetaUpdateSchema } from '@documenso/lib/types/document-meta';
import { z } from 'zod';

import { ZSuccessResponseSchema } from '../schema';
import type { TrpcRouteMeta } from '../trpc';
import { ZRecipientWithSigningUrlSchema } from './schema';

const ZScheduledSendAtSchema = z.coerce.date().refine((date) => date > new Date(), {
  message: 'Scheduled send time must be in the future.',
});

export const distributeEnvelopeMeta: TrpcRouteMeta = {
  openapi: {
    method: 'POST',
    path: '/envelope/distribute',
    summary: 'Distribute envelope',
    description: 'Send the envelope to recipients based on your distribution method',
    tags: ['Envelope'],
  },
};

export const ZDistributeEnvelopeRequestSchema = z.object({
  envelopeId: z.string().describe('The ID of the envelope to send.'),
  scheduledSendAt: ZScheduledSendAtSchema.optional().describe('A future date and time at which to send the envelope.'),
  meta: ZDocumentMetaUpdateSchema.pick({
    subject: true,
    message: true,
    timezone: true,
    dateFormat: true,
    distributionMethod: true,
    redirectUrl: true,
    language: true,
    emailId: true,
    emailReplyTo: true,
    emailSettings: true,
  }).optional(),
});

export const ZDistributeEnvelopeResponseSchema = ZSuccessResponseSchema.extend({
  id: z.string().describe('The ID of the envelope that was sent.'),
  recipients: ZRecipientWithSigningUrlSchema.array(),
});

export type TDistributeEnvelopeRequest = z.infer<typeof ZDistributeEnvelopeRequestSchema>;
export type TDistributeEnvelopeResponse = z.infer<typeof ZDistributeEnvelopeResponseSchema>;
