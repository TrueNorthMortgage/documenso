import { z } from 'zod';

import { ZEmailTemplateDataSchema } from '@documenso/lib/types/email-message';

export const ZCreateEmailTemplateRequestSchema = z.intersection(
  z.object({ teamId: z.number().int() }),
  ZEmailTemplateDataSchema,
);
