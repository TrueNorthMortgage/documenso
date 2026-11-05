import { z } from 'zod';

export const ZEmailTemplateDataSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    subject: z.string().max(255),
    message: z.string().max(5000),
  })
  .refine(({ subject, message }) => Boolean(subject.trim() || message.trim()), { path: ['message'] });
