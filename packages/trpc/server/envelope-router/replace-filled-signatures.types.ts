import { SIGNATURE_FONT_FAMILY_KEYS } from '@documenso/lib/constants/signatures';
import { ZRecipientActionAuthSchema } from '@documenso/lib/types/document-auth';
import SignatureSchema from '@documenso/prisma/generated/zod/modelSchema/SignatureSchema';
import { z } from 'zod';

export const ZReplaceFilledSignaturesRequestSchema = z.object({
  token: z.string(),
  value: z.string().min(1),
  signatureFont: z.enum(SIGNATURE_FONT_FAMILY_KEYS).nullable().optional(),
  authOptions: ZRecipientActionAuthSchema.optional(),
});

export const ZReplaceFilledSignaturesResponseSchema = z.object({
  fields: z.array(z.object({ id: z.number(), signature: SignatureSchema })),
});
