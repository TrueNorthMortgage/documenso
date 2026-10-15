import { z } from 'zod';

import { ZReassignEnvelopeSenderRequestSchema } from './reassign-envelope-sender.types';

export const ZBulkReassignEnvelopeSenderRequestSchema = z.object({
  newOwnerId: ZReassignEnvelopeSenderRequestSchema.shape.newOwnerId,
  envelopes: z
    .array(ZReassignEnvelopeSenderRequestSchema.omit({ newOwnerId: true }))
    .min(1)
    .max(100)
    .refine((envelopes) => new Set(envelopes.map(({ envelopeId }) => envelopeId)).size === envelopes.length, {
      message: 'Select each envelope only once.',
    }),
});

export const ZBulkReassignEnvelopeSenderResponseSchema = z.object({
  succeededIds: z.array(z.string()),
  failed: z.array(z.object({ envelopeId: z.string(), message: z.string() })),
});
