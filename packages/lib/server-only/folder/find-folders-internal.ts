import { prisma } from '@documenso/prisma';
import { EnvelopeType, TeamMemberRole } from '@prisma/client';

import { TEAM_DOCUMENT_VISIBILITY_MAP } from '../../constants/teams';
import type { TFolderType } from '../../types/folder-type';
import { getTeamById } from '../team/get-team';

const getOwnerName = (user: { name: string | null; email: string }) => user.name || user.email;

export interface FindFoldersInternalOptions {
  userId: number;
  teamId: number;
  parentId?: string | null;
  type?: TFolderType;
}

export const findFoldersInternal = async ({ userId, teamId, parentId, type }: FindFoldersInternalOptions) => {
  const team = await getTeamById({ userId, teamId });

  const visibilityFilters = {
    visibility: {
      in: TEAM_DOCUMENT_VISIBILITY_MAP[team.currentTeamRole],
    },
  };
  const canViewOwner = team.currentTeamRole === TeamMemberRole.ADMIN || team.currentTeamRole === TeamMemberRole.MANAGER;

  const whereClause = {
    AND: [
      { parentId },
      {
        OR: [
          { teamId, ...visibilityFilters },
          { userId, teamId },
        ],
      },
    ],
  };

  try {
    const folders = await prisma.folder.findMany({
      where: {
        ...whereClause,
        ...(type ? { type } : {}),
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    });

    const foldersWithDetails = await Promise.all(
      folders.map(async (folder) => {
        try {
          const [subfolders, documentCount, templateCount, subfolderCount] = await Promise.all([
            prisma.folder.findMany({
              where: {
                parentId: folder.id,
                teamId,
                OR: [visibilityFilters, { userId }],
              },
              include: {
                user: {
                  select: {
                    name: true,
                    email: true,
                  },
                },
              },
              orderBy: {
                createdAt: 'desc',
              },
            }),
            prisma.envelope.count({
              where: {
                type: EnvelopeType.DOCUMENT,
                folderId: folder.id,
                deletedAt: null,
              },
            }),
            prisma.envelope.count({
              where: {
                type: EnvelopeType.TEMPLATE,
                folderId: folder.id,
                deletedAt: null,
              },
            }),
            prisma.folder.count({
              where: {
                parentId: folder.id,
                teamId,
                OR: [visibilityFilters, { userId }],
              },
            }),
          ]);

          const subfoldersWithEmptySubfolders = subfolders.map(({ user, ...subfolder }) => ({
            ...subfolder,
            ...(canViewOwner ? { ownerName: getOwnerName(user) } : {}),
            subfolders: [],
            _count: {
              documents: 0,
              templates: 0,
              subfolders: 0,
            },
          }));

          const { user, ...folderData } = folder;

          return {
            ...folderData,
            ...(canViewOwner ? { ownerName: getOwnerName(user) } : {}),
            subfolders: subfoldersWithEmptySubfolders,
            _count: {
              documents: documentCount,
              templates: templateCount,
              subfolders: subfolderCount,
            },
          };
        } catch (error) {
          console.error('Error processing folder:', folder.id, error);
          throw error;
        }
      }),
    );

    return foldersWithDetails;
  } catch (error) {
    console.error('Error in findFolders:', error);
    throw error;
  }
};
