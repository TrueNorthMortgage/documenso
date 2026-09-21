import { ZDocumentLiteSchema } from '@documenso/lib/types/document';
import { ZDocumentEmailSettingsSchema } from '@documenso/lib/types/document-email';
import {
  ZDocumentMetaDateFormatSchema,
  ZDocumentMetaDistributionMethodSchema,
  ZDocumentMetaLanguageSchema,
  ZDocumentMetaMessageSchema,
  ZDocumentMetaRedirectUrlSchema,
  ZDocumentMetaSubjectSchema,
  ZDocumentMetaTimezoneSchema,
} from '@documenso/lib/types/document-meta';
import { zEmail } from '@documenso/lib/utils/zod';
import { z } from 'zod';

import type { TrpcRouteMeta } from '../trpc';

const ZScheduledSendAtSchema = z.coerce.date().refine((date) => date > new Date(), {
  message: 'Scheduled send time must be in the future.',
});

export const distributeDocumentMeta: TrpcRouteMeta = {
  openapi: {
    method: 'POST',
    path: '/document/distribute',
    summary: 'Distribute document',
    description: 'Send the document out to recipients based on your distribution method',
    tags: ['Document'],
  },
};

export const ZDistributeDocumentRequestSchema = z.object({
  documentId: z.number().describe('The ID of the document to send.'),
  scheduledSendAt: ZScheduledSendAtSchema.optional().describe('A future date and time at which to send the document.'),
  meta: z
    .object({
      subject: ZDocumentMetaSubjectSchema.optional(),
      message: ZDocumentMetaMessageSchema.optional(),
      timezone: ZDocumentMetaTimezoneSchema.optional(),
      dateFormat: ZDocumentMetaDateFormatSchema.optional(),
      distributionMethod: ZDocumentMetaDistributionMethodSchema.optional(),
      redirectUrl: ZDocumentMetaRedirectUrlSchema.optional(),
      language: ZDocumentMetaLanguageSchema.optional(),
      emailId: z.string().nullish(),
      emailReplyTo: zEmail().nullish(),
      emailSettings: ZDocumentEmailSettingsSchema.optional(),
    })
    .optional(),
});

export const ZDistributeDocumentResponseSchema = ZDocumentLiteSchema;

export type TDistributeDocumentRequest = z.infer<typeof ZDistributeDocumentRequestSchema>;
export type TDistributeDocumentResponse = z.infer<typeof ZDistributeDocumentResponseSchema>;
