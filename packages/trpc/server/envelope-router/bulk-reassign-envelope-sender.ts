import { bulkReassignEnvelopeSender } from '@documenso/lib/server-only/envelope/bulk-reassign-envelope-sender';

import { authenticatedProcedure } from '../trpc';
import {
  ZBulkReassignEnvelopeSenderRequestSchema,
  ZBulkReassignEnvelopeSenderResponseSchema,
} from './bulk-reassign-envelope-sender.types';

export const bulkReassignEnvelopeSenderRoute = authenticatedProcedure
  .input(ZBulkReassignEnvelopeSenderRequestSchema)
  .output(ZBulkReassignEnvelopeSenderResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { envelopes, newOwnerId } = input;
    return await bulkReassignEnvelopeSender({
      envelopes,
      newOwnerId,
      userId: ctx.user.id,
      teamId: ctx.teamId,
      requestMetadata: ctx.metadata,
    });
  });
