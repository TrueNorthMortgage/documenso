import { getLatestEnvelopeActivity } from '@documenso/lib/server-only/document/get-latest-envelope-activity';

import { authenticatedProcedure } from '../trpc';
import {
  ZGetLatestEnvelopeActivityRequestSchema,
  ZGetLatestEnvelopeActivityResponseSchema,
} from './get-latest-envelope-activity.types';

export const getLatestEnvelopeActivityRoute = authenticatedProcedure
  .input(ZGetLatestEnvelopeActivityRequestSchema)
  .output(ZGetLatestEnvelopeActivityResponseSchema)
  .query(async ({ ctx, input }) => {
    const { teamId, category } = input;

    return await getLatestEnvelopeActivity({ userId: ctx.user.id, teamId, category });
  });
