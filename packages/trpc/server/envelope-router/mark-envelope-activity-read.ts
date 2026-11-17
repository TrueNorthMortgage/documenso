import { markEnvelopeActivityRead } from '@documenso/lib/server-only/document/mark-envelope-activity-read';

import { authenticatedProcedure } from '../trpc';
import {
  ZMarkEnvelopeActivityReadRequestSchema,
  ZMarkEnvelopeActivityReadResponseSchema,
} from './mark-envelope-activity-read.types';

export const markEnvelopeActivityReadRoute = authenticatedProcedure
  .input(ZMarkEnvelopeActivityReadRequestSchema)
  .output(ZMarkEnvelopeActivityReadResponseSchema)
  .mutation(async ({ ctx, input }) => {
    const { teamId, eventIds } = input;

    return await markEnvelopeActivityRead({ userId: ctx.user.id, teamId, eventIds });
  });
