import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { getTeamById } from '@documenso/lib/server-only/team/get-team';
import { prisma } from '@documenso/prisma';

import { authenticatedProcedure } from '../trpc';
import { ZUpdateEmailMessageFavoriteRequestSchema } from './update-email-message-favorite.types';

export const updateEmailMessageFavoriteRoute = authenticatedProcedure
  .input(ZUpdateEmailMessageFavoriteRequestSchema)
  .mutation(async ({ input, ctx }) => {
    const { teamId, id, data } = input;
    const userId = ctx.user.id;

    await getTeamById({ teamId, userId });

    const message = await prisma.emailMessage.findFirst({
      where: { id, teamId, OR: [{ ownerId: null }, { ownerId: userId }] },
      select: { id: true },
    });

    if (!message) {
      throw new AppError(AppErrorCode.NOT_FOUND);
    }

    const favorite = { userId, messageId: id };
    if (data.isFavorite) {
      await prisma.emailMessageFavorite.createMany({ data: favorite, skipDuplicates: true });
    } else {
      await prisma.emailMessageFavorite.deleteMany({ where: favorite });
    }
  });
