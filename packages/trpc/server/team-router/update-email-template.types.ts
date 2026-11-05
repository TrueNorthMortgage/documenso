import { z } from 'zod';

import { ZEmailTemplateDataSchema } from '@documenso/lib/types/email-message';

export const ZUpdateEmailTemplateRequestSchema = z.object({
  teamId: z.number().int(),
  id: z.string(),
  data: ZEmailTemplateDataSchema,
});
