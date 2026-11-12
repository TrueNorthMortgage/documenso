import { zEmail } from '@documenso/lib/utils/zod';
import { z } from 'zod';

export const ZSendEnvelopePreviewRequestSchema = z.object({
  envelopeId: z.string().min(1),
  emails: z
    .array(zEmail().transform((email) => email.toLowerCase()))
    .min(1)
    .max(10)
    .transform((emails) => [...new Set(emails)]),
  subject: z
    .string()
    .trim()
    .max(200)
    .regex(/^[^\r\n]*$/)
    .optional(),
  message: z.string().trim().max(5000).optional(),
});

export const ZSharedEnvelopePreviewSchema = z.object({
  previewUrl: z.string().url().nullable(),
  isActive: z.boolean(),
});

export const ZSendEnvelopePreviewResponseSchema = z.object({
  failedEmails: z.array(z.string()),
  sharedPreview: ZSharedEnvelopePreviewSchema.nullable(),
});
