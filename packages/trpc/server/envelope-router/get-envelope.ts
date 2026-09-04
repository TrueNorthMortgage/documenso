import { getEnvelopeById } from '@documenso/lib/server-only/envelope/get-envelope-by-id';
import { getTeamById } from '@documenso/lib/server-only/team/get-team';
import { maskRecipientTokensForDocument } from '@documenso/lib/utils/mask-recipient-tokens-for-document';

import { authenticatedProcedure } from '../trpc';
import { getEnvelopeMeta, ZGetEnvelopeRequestSchema, ZGetEnvelopeResponseSchema } from './get-envelope.types';

export const getEnvelopeRoute = authenticatedProcedure
  .meta(getEnvelopeMeta)
  .input(ZGetEnvelopeRequestSchema)
  .output(ZGetEnvelopeResponseSchema)
  .query(async ({ input, ctx }) => {
    const { teamId, user } = ctx;
    const { envelopeId } = input;

    ctx.logger.info({
      input: {
        envelopeId,
      },
    });

    const [envelope, team] = await Promise.all([
      getEnvelopeById({
        userId: user.id,
        teamId,
        id: {
          type: 'envelopeId',
          id: envelopeId,
        },
        type: null,
      }),
      getTeamById({ userId: user.id, teamId }),
    ]);

    const maskedEnvelope = maskRecipientTokensForDocument({
      document: envelope,
      user,
      currentTeamRole: team.currentTeamRole,
    });

    return {
      ...maskedEnvelope,
      recipients: maskedEnvelope.recipients,
    };
  });
