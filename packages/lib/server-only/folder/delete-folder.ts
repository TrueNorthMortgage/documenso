import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { prisma } from '@documenso/prisma';

import { TEAM_DOCUMENT_VISIBILITY_MAP } from '../../constants/teams';
import { buildTeamWhereQuery, canManageFolder } from '../../utils/teams';
import { getTeamById } from '../team/get-team';

export interface DeleteFolderOptions {
  userId: number;
  teamId: number;
  folderId: string;
}

export const deleteFolder = async ({ userId, teamId, folderId }: DeleteFolderOptions) => {
  const team = await getTeamById({ userId, teamId });

  const folder = await prisma.folder.findFirst({
    where: {
      id: folderId,
      team: buildTeamWhereQuery({
        teamId,
        userId,
      }),
      OR: [{ visibility: { in: TEAM_DOCUMENT_VISIBILITY_MAP[team.currentTeamRole] } }, { userId }],
    },
  });

  if (!folder) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Folder not found',
    });
  }

  if (
    !canManageFolder({
      userId,
      folderOwnerId: folder.userId,
      currentTeamRole: team.currentTeamRole,
    })
  ) {
    throw new AppError(AppErrorCode.FORBIDDEN, {
      message: 'Only the folder owner or a manager can delete this folder',
      userMessage: 'Only the folder owner or a manager can delete this folder.',
    });
  }

  return await prisma.folder.delete({
    where: {
      id: folder.id,
    },
  });
};
