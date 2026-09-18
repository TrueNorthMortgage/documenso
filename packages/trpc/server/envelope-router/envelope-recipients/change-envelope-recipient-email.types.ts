import { zEmail } from '@documenso/lib/utils/zod';
import { z } from 'zod';

import { ZSuccessResponseSchema } from '../../schema';
import type { TrpcRouteMeta } from '../../trpc';

export const changeEnvelopeRecipientEmailMeta: TrpcRouteMeta = {
  openapi: {
    method: 'POST',
    path: '/envelope/recipient/change-email',
    summary: 'Change an unopened recipient email',
    description:
      'Changes the email and signing token for an unopened, unsigned recipient after another recipient has completed the envelope.',
    tags: ['Envelope Recipients'],
  },
};

export const ZChangeEnvelopeRecipientEmailRequestSchema = z.object({
  envelopeId: z.string(),
  recipientId: z.number(),
  email: zEmail('Enter a valid email address.').trim().toLowerCase().max(254),
});

export const ZChangeEnvelopeRecipientEmailResponseSchema = ZSuccessResponseSchema;

export type TChangeEnvelopeRecipientEmailRequest = z.infer<typeof ZChangeEnvelopeRecipientEmailRequestSchema>;
export type TChangeEnvelopeRecipientEmailResponse = z.infer<typeof ZChangeEnvelopeRecipientEmailResponseSchema>;
