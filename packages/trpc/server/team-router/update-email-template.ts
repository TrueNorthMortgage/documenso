import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { getTeamById } from '@documenso/lib/server-only/team/get-team';
import { canExecuteTeamAction } from '@documenso/lib/utils/teams';
import { prisma } from '@documenso/prisma';

import { authenticatedProcedure } from '../trpc';
import { ZUpdateEmailTemplateRequestSchema } from './update-email-template.types';

export const updateEmailTemplateRoute = authenticatedProcedure
  .input(ZUpdateEmailTemplateRequestSchema)
  .mutation(async ({ input, ctx }) => {
    const { teamId, id, data } = input;
    const team = await getTeamById({ teamId, userId: ctx.user.id });

    if (!canExecuteTeamAction('MANAGE_TEAM', team.currentTeamRole)) {
      throw new AppError(AppErrorCode.UNAUTHORIZED);
    }

    const result = await prisma.emailMessage.updateMany({ where: { id, teamId, ownerId: null }, data });

    if (result.count === 0) {
      throw new AppError(AppErrorCode.NOT_FOUND);
    }
  });
