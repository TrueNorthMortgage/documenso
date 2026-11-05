import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { getTeamById } from '@documenso/lib/server-only/team/get-team';
import { canExecuteTeamAction } from '@documenso/lib/utils/teams';
import { prisma } from '@documenso/prisma';

import { authenticatedProcedure } from '../trpc';
import { ZCreateEmailTemplateRequestSchema } from './create-email-template.types';

export const createEmailTemplateRoute = authenticatedProcedure
  .input(ZCreateEmailTemplateRequestSchema)
  .mutation(async ({ input, ctx }) => {
    const { teamId, name, subject, message } = input;
    const team = await getTeamById({ teamId, userId: ctx.user.id });

    if (!canExecuteTeamAction('MANAGE_TEAM', team.currentTeamRole)) {
      throw new AppError(AppErrorCode.UNAUTHORIZED);
    }

    await prisma.emailMessage.create({ data: { teamId, name, subject, message } });
  });
