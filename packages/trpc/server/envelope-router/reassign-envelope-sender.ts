import { reassignEnvelopeSender } from '@documenso/lib/server-only/envelope/reassign-envelope-sender';

import { authenticatedProcedure } from '../trpc';
import {
  ZReassignEnvelopeSenderRequestSchema,
  ZReassignEnvelopeSenderResponseSchema,
} from './reassign-envelope-sender.types';

export const reassignEnvelopeSenderRoute = authenticatedProcedure
  .input(ZReassignEnvelopeSenderRequestSchema)
  .output(ZReassignEnvelopeSenderResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { envelopeId, newOwnerId, expectedOwnerId } = input;
    return await reassignEnvelopeSender({
      envelopeId,
      newOwnerId,
      expectedOwnerId,
      userId: ctx.user.id,
      teamId: ctx.teamId,
      requestMetadata: ctx.metadata,
    });
  });
