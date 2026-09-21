import { cancelScheduledEnvelopeSend } from '@documenso/lib/server-only/envelope/schedule-envelope-send';

import { authenticatedProcedure } from '../trpc';
import {
  cancelScheduledSendMeta,
  ZCancelScheduledSendRequestSchema,
  ZCancelScheduledSendResponseSchema,
} from './cancel-scheduled-send.types';

export const cancelScheduledSendRoute = authenticatedProcedure
  .meta(cancelScheduledSendMeta)
  .input(ZCancelScheduledSendRequestSchema)
  .output(ZCancelScheduledSendResponseSchema)
  .mutation(async ({ input, ctx }) => {
    await cancelScheduledEnvelopeSend({
      id: { type: 'envelopeId', id: input.envelopeId },
      userId: ctx.user.id,
      teamId: ctx.teamId,
    });

    return { success: true };
  });
