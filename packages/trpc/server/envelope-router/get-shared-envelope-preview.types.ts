import { z } from 'zod';

import { ZSharedEnvelopePreviewSchema } from './send-envelope-preview.types';

export const ZGetSharedEnvelopePreviewRequestSchema = z.object({
  envelopeId: z.string().min(1),
});

export const ZGetSharedEnvelopePreviewResponseSchema = ZSharedEnvelopePreviewSchema.nullable();
