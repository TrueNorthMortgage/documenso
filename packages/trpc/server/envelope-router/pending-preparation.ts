import { getServerLimits } from '@documenso/ee/server-only/limits/server';
import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { prefixedId } from '@documenso/lib/universal/id';
import { prisma } from '@documenso/prisma';

import { authenticatedProcedure } from '../trpc';
import {
  pendingPreparationMeta,
  ZPendingPreparationRequestSchema,
  ZPendingPreparationResponseSchema,
} from './pending-preparation.types';
import { prepareEnvelopeData } from './prepare-envelope-data';

const pendingPreparationTtlSeconds = () => {
  const configuredTtl = Number(process.env.SELF_HOSTED_PENDING_PREPARATION_TTL_SECONDS || 900);

  return Number.isInteger(configuredTtl) && configuredTtl > 0 ? configuredTtl : 900;
};

export const pendingPreparationRoute = authenticatedProcedure
  .meta(pendingPreparationMeta)
  .input(ZPendingPreparationRequestSchema)
  .output(ZPendingPreparationResponseSchema)
  .mutation(async ({ input, ctx }) => {
    if (ctx.metadata.auth !== 'api' || !ctx.teamId) {
      throw new AppError(AppErrorCode.UNAUTHORIZED, {
        message: 'Pending preparation requires a team API token',
      });
    }

    if (input.payload.type !== 'DOCUMENT') {
      throw new AppError(AppErrorCode.INVALID_BODY, {
        message: 'Pending file preparation only supports document envelopes',
      });
    }

    const { remaining, maximumEnvelopeItemCount } = await getServerLimits({
      userId: ctx.user.id,
      teamId: ctx.teamId,
    });

    if (remaining.documents <= 0) {
      throw new AppError(AppErrorCode.LIMIT_EXCEEDED, {
        message: 'You have reached your document limit for this month. Please upgrade your plan.',
        statusCode: 400,
      });
    }

    if (input.files.length > maximumEnvelopeItemCount) {
      throw new AppError('ENVELOPE_ITEM_LIMIT_EXCEEDED', {
        message: `You cannot upload more than ${maximumEnvelopeItemCount} envelope items per envelope`,
        statusCode: 400,
      });
    }

    const team = await prisma.team.findUnique({
      where: { id: ctx.teamId },
      select: { organisationId: true },
    });

    if (!team) {
      throw new AppError(AppErrorCode.NOT_FOUND, { message: 'Team not found' });
    }

    const actorEmail = ctx.req.headers.get('x-mercury-actor-email')?.trim().toLowerCase();

    if (!actorEmail) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: 'The trusted actor email header is required for pending preparation',
      });
    }

    const { envelopeItems } = await prepareEnvelopeData({
      payload: input.payload,
      files: input.files,
      logger: ctx.logger,
    });
    const id = prefixedId('pending');
    const expiresAt = new Date(Date.now() + pendingPreparationTtlSeconds() * 1000);

    await prisma.pendingPreparation.create({
      data: {
        id,
        organisationId: team.organisationId,
        teamId: ctx.teamId,
        actorEmail,
        payload: input.payload,
        expiresAt,
        documents: {
          create: envelopeItems.map((item, index) => ({
            id: prefixedId('pending_data'),
            documentDataId: item.documentDataId,
            order: index + 1,
            fileMetadata: {
              name: item.title,
              placeholders: item.placeholders,
            },
          })),
        },
      },
    });

    return {
      id,
      continuationUrl: `${NEXT_PUBLIC_WEBAPP_URL()}/pending/${id}`,
      expiresAt: expiresAt.toISOString(),
    };
  });
