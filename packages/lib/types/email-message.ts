import { z } from 'zod';

export const ZEmailMessageContentSchema = z.object({
  subject: z.string().max(255),
  message: z.string().max(5000),
});

export const ZEmailTemplateDataSchema = ZEmailMessageContentSchema.extend({
  name: z.string().trim().min(1).max(100),
}).refine(({ subject, message }) => Boolean(subject.trim() || message.trim()), { path: ['message'] });
