import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { getTeamById } from '@documenso/lib/server-only/team/get-team';
import { prisma } from '@documenso/prisma';

import { authenticatedProcedure } from '../trpc';
import { ZDeletePersonalEmailMessageRequestSchema } from './delete-personal-email-message.types';

export const deletePersonalEmailMessageRoute = authenticatedProcedure
  .input(ZDeletePersonalEmailMessageRequestSchema)
  .mutation(async ({ input, ctx }) => {
    const { teamId, id } = input;
    const userId = ctx.user.id;

    await getTeamById({ teamId, userId });

    const result = await prisma.emailMessage.deleteMany({ where: { id, teamId, ownerId: userId } });

    if (result.count === 0) {
      throw new AppError(AppErrorCode.NOT_FOUND);
    }
  });
