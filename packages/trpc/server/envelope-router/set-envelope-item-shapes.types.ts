import { ZEnvelopeShapesSchema } from '@documenso/lib/types/envelope-shape';
import { z } from 'zod';

export const ZSetEnvelopeItemShapesRequestSchema = z.object({
  envelopeId: z.string(),
  envelopeItemId: z.string(),
  data: z.object({ shapes: ZEnvelopeShapesSchema, previousShapes: ZEnvelopeShapesSchema }),
});

export const ZSetEnvelopeItemShapesResponseSchema = z.object({ shapes: ZEnvelopeShapesSchema });
