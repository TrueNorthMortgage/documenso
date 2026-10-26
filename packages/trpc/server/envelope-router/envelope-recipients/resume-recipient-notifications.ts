import { resumeRecipientNotifications } from '@documenso/lib/server-only/recipient/resume-recipient-notifications';

import { authenticatedProcedure } from '../../trpc';
import {
  ZResumeRecipientNotificationsRequestSchema,
  ZResumeRecipientNotificationsResponseSchema,
} from './resume-recipient-notifications.types';

export const resumeRecipientNotificationsRoute = authenticatedProcedure
  .input(ZResumeRecipientNotificationsRequestSchema)
  .output(ZResumeRecipientNotificationsResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { envelopeId, auditLogId } = input;

    await resumeRecipientNotifications({
      envelopeId,
      auditLogId,
      userId: ctx.user.id,
      teamId: ctx.teamId,
      requestMetadata: ctx.metadata,
    });

    return { success: true };
  });
