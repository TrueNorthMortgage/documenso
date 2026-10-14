import { z } from 'zod';

export const ZReassignEnvelopeSenderRequestSchema = z.object({
  envelopeId: z.string().min(1),
  newOwnerId: z.number().int().positive(),
  expectedOwnerId: z.number().int().positive(),
});
export const ZReassignEnvelopeSenderResponseSchema = z.object({ id: z.string() });
