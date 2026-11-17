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
    return await getLatestEnvelopeActivity({ ...input, userId: ctx.user.id, userEmail: ctx.user.email });
  });
