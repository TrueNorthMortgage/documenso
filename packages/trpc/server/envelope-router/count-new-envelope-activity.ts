import { countNewEnvelopeActivity } from '@documenso/lib/server-only/document/get-latest-envelope-activity';

import { authenticatedProcedure } from '../trpc';
import {
  ZCountNewEnvelopeActivityRequestSchema,
  ZCountNewEnvelopeActivityResponseSchema,
} from './count-new-envelope-activity.types';

export const countNewEnvelopeActivityRoute = authenticatedProcedure
  .input(ZCountNewEnvelopeActivityRequestSchema)
  .output(ZCountNewEnvelopeActivityResponseSchema)
  .query(async ({ ctx, input }) => {
    const { teamId, seenThrough } = input;

    return await countNewEnvelopeActivity({ userId: ctx.user.id, teamId, seenThrough });
  });
