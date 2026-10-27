import { z } from 'zod';

import { ZSuccessResponseSchema } from '../../schema';

export const ZResumeRecipientNotificationsRequestSchema = z.object({
  envelopeId: z.string(),
  auditLogId: z.string(),
});

export const ZResumeRecipientNotificationsResponseSchema = ZSuccessResponseSchema;
