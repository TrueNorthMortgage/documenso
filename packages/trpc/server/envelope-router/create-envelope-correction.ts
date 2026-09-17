import { createEnvelopeCorrection } from '@documenso/lib/server-only/envelope/create-envelope-correction';

import { authenticatedProcedure } from '../trpc';
import {
  createEnvelopeCorrectionMeta,
  ZCreateEnvelopeCorrectionRequestSchema,
  ZCreateEnvelopeCorrectionResponseSchema,
} from './create-envelope-correction.types';

export const createEnvelopeCorrectionRoute = authenticatedProcedure
  .meta(createEnvelopeCorrectionMeta)
  .input(ZCreateEnvelopeCorrectionRequestSchema)
  .output(ZCreateEnvelopeCorrectionResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const duplicatedEnvelope = await createEnvelopeCorrection({
      id: {
        type: 'envelopeId',
        id: input.envelopeId,
      },
      userId: ctx.user.id,
      teamId: ctx.teamId,
      requestMetadata: ctx.metadata,
    });

    return {
      id: duplicatedEnvelope.id,
    };
  });
