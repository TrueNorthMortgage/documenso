import { prisma } from '@documenso/prisma';
import type { Prisma } from '@prisma/client';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { canExecuteTeamAction } from '../../utils/teams';
import { getTeamById } from './get-team';

// Shared by candidate selection and the transactional ownership change.
export const activeTeamMemberWhere = (teamId: number): Prisma.UserWhereInput => ({
  disabled: false,
  organisationMember: {
    some: {
      organisationGroupMembers: {
        some: {
          group: { teamGroups: { some: { teamId } } },
        },
      },
    },
  },
});

export const getReassignmentCandidates = async ({ userId, teamId }: { userId: number; teamId: number }) => {
  const team = await getTeamById({ userId, teamId });
  if (!canExecuteTeamAction('MANAGE_TEAM', team.currentTeamRole)) {
    throw new AppError(AppErrorCode.FORBIDDEN);
  }

  return await prisma.user.findMany({
    where: activeTeamMemberWhere(teamId),
    select: { id: true, name: true, email: true },
    orderBy: [{ name: 'asc' }, { email: 'asc' }],
  });
};
