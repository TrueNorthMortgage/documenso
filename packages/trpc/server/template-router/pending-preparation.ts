import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { getEnvelopeById } from '@documenso/lib/server-only/envelope/get-envelope-by-id';
import { prefixedId } from '@documenso/lib/universal/id';
import { prisma } from '@documenso/prisma';

import { authenticatedProcedure } from '../trpc';
import {
  pendingTemplatePreparationMeta,
  ZPendingTemplatePreparationRequestSchema,
  ZPendingTemplatePreparationResponseSchema,
} from './pending-preparation.types';

const pendingPreparationTtlSeconds = () => {
  const configuredTtl = Number(process.env.SELF_HOSTED_PENDING_PREPARATION_TTL_SECONDS || 900);

  return Number.isInteger(configuredTtl) && configuredTtl > 0 ? configuredTtl : 900;
};

export const pendingTemplatePreparationRoute = authenticatedProcedure
  .meta(pendingTemplatePreparationMeta)
  .input(ZPendingTemplatePreparationRequestSchema)
  .output(ZPendingTemplatePreparationResponseSchema)
  .mutation(async ({ input, ctx }) => {
    if (ctx.metadata.auth !== 'api' || !ctx.teamId) {
      throw new AppError(AppErrorCode.UNAUTHORIZED, {
        message: 'Pending preparation requires a team API token',
      });
    }

    await getEnvelopeById({
      id: { type: 'templateId', id: input.templateId },
      type: 'TEMPLATE',
      userId: ctx.user.id,
      teamId: ctx.teamId,
    });

    const actorEmail = ctx.req.headers.get('x-mercury-actor-email')?.trim().toLowerCase();

    if (!actorEmail) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: 'The trusted actor email header is required for pending preparation',
      });
    }

    const team = await prisma.team.findUnique({
      where: { id: ctx.teamId },
      select: { organisationId: true },
    });

    if (!team) {
      throw new AppError(AppErrorCode.NOT_FOUND, { message: 'Team not found' });
    }

    const id = prefixedId('pending');
    const expiresAt = new Date(Date.now() + pendingPreparationTtlSeconds() * 1000);

    await prisma.pendingPreparation.create({
      data: {
        id,
        organisationId: team.organisationId,
        teamId: ctx.teamId,
        actorEmail,
        payload: {
          kind: 'template',
          ...input,
        },
        expiresAt,
      },
    });

    return {
      id,
      continuationUrl: `${NEXT_PUBLIC_WEBAPP_URL()}/pending/${id}`,
      expiresAt: expiresAt.toISOString(),
    };
  });
