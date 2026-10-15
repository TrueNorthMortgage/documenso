import { getReassignmentCandidates } from '@documenso/lib/server-only/team/get-reassignment-candidates';

import { authenticatedProcedure } from '../trpc';
import {
  ZFindReassignmentCandidatesRequestSchema,
  ZFindReassignmentCandidatesResponseSchema,
} from './find-reassignment-candidates.types';

export const findReassignmentCandidatesRoute = authenticatedProcedure
  .input(ZFindReassignmentCandidatesRequestSchema)
  .output(ZFindReassignmentCandidatesResponseSchema)
  .query(async ({ input, ctx }) => {
    const { teamId, search, excludeUserId } = input;
    return await getReassignmentCandidates({ userId: ctx.user.id, teamId, search, excludeUserId });
  });
