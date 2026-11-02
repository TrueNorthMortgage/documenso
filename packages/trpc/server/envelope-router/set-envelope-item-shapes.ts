import { setEnvelopeItemShapes } from '@documenso/lib/server-only/envelope-item/set-envelope-item-shapes';

import { authenticatedProcedure } from '../trpc';
import {
  ZSetEnvelopeItemShapesRequestSchema,
  ZSetEnvelopeItemShapesResponseSchema,
} from './set-envelope-item-shapes.types';

export const setEnvelopeItemShapesRoute = authenticatedProcedure
  .input(ZSetEnvelopeItemShapesRequestSchema)
  .output(ZSetEnvelopeItemShapesResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { envelopeId, envelopeItemId, data } = input;

    return await setEnvelopeItemShapes({
      envelopeId,
      envelopeItemId,
      shapes: data.shapes,
      previousShapes: data.previousShapes,
      userId: ctx.user.id,
      teamId: ctx.teamId,
      requestMetadata: ctx.metadata,
    });
  });
