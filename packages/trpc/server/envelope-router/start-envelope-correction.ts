import { startEnvelopeCorrection } from '@documenso/lib/server-only/envelope/start-envelope-correction';

import { authenticatedProcedure } from '../trpc';
import {
  startEnvelopeCorrectionMeta,
  ZStartEnvelopeCorrectionRequestSchema,
  ZStartEnvelopeCorrectionResponseSchema,
} from './start-envelope-correction.types';

export const startEnvelopeCorrectionRoute = authenticatedProcedure
  .meta(startEnvelopeCorrectionMeta)
  .input(ZStartEnvelopeCorrectionRequestSchema)
  .output(ZStartEnvelopeCorrectionResponseSchema)
  .mutation(async ({ input, ctx }) => {
    return await startEnvelopeCorrection({
      id: {
        type: 'envelopeId',
        id: input.envelopeId,
      },
      userId: ctx.user.id,
      teamId: ctx.teamId,
      requestMetadata: ctx.metadata,
    });
  });
