import { resendDocument } from '@documenso/lib/server-only/document/resend-document';
import { getTeamById } from '@documenso/lib/server-only/team/get-team';
import { maskRecipientTokensForDocument } from '@documenso/lib/utils/mask-recipient-tokens-for-document';
import { formatSigningLink } from '@documenso/lib/utils/recipients';

import { authenticatedProcedure } from '../trpc';
import {
  redistributeEnvelopeMeta,
  ZRedistributeEnvelopeRequestSchema,
  ZRedistributeEnvelopeResponseSchema,
} from './redistribute-envelope.types';

export const redistributeEnvelopeRoute = authenticatedProcedure
  .meta(redistributeEnvelopeMeta)
  .input(ZRedistributeEnvelopeRequestSchema)
  .output(ZRedistributeEnvelopeResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { teamId } = ctx;
    const { envelopeId, recipients } = input;

    ctx.logger.info({
      input: {
        envelopeId,
        recipients,
      },
    });

    const envelope = await resendDocument({
      userId: ctx.user.id,
      teamId,
      id: {
        type: 'envelopeId',
        id: envelopeId,
      },
      recipients,
      requestMetadata: ctx.metadata,
    });

    const team = await getTeamById({ userId: ctx.user.id, teamId });
    const maskedEnvelope = maskRecipientTokensForDocument({
      document: envelope,
      user: ctx.user,
      currentTeamRole: team.currentTeamRole,
    });

    return {
      success: true,
      id: envelope.id,
      recipients: maskedEnvelope.recipients.map((recipient) => ({
        id: recipient.id,
        name: recipient.name,
        email: recipient.email,
        token: recipient.token,
        role: recipient.role,
        signingOrder: recipient.signingOrder,
        signingUrl: recipient.token ? formatSigningLink(recipient.token) : '',
      })),
    };
  });
