import { ZEmailMessageContentSchema } from '@documenso/lib/types/email-message';
import { z } from 'zod';

export const ZCreatePersonalEmailTemplateRequestSchema = ZEmailMessageContentSchema.extend({
  teamId: z.number().int(),
}).refine(({ subject, message }) => Boolean(subject.trim() || message.trim()), { path: ['message'] });
