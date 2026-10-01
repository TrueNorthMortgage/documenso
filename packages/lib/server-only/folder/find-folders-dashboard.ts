import { prisma } from '@documenso/prisma';
import { EnvelopeType, Prisma, TeamMemberRole } from '@prisma/client';

import { TEAM_DOCUMENT_VISIBILITY_MAP } from '../../constants/teams';
import type { TFolderType } from '../../types/folder-type';
import { getTeamById } from '../team/get-team';

const getOwnerName = (user: { name: string | null; email: string }) => user.name || user.email;

export interface FindFoldersDashboardOptions {
  userId: number;
  teamId: number;
  parentId?: string | null;
  type?: TFolderType;
  query?: string;
  page?: number;
  perPage?: number;
}

/**
 * Fetch a single folder-management page with all display data in two queries.
 * This intentionally avoids the per-folder count and child-folder queries used by
 * the legacy folder picker.
 */
export const findFoldersDashboard = async ({
  userId,
  teamId,
  parentId,
  type,
  query,
  page = 1,
  perPage = 25,
}: FindFoldersDashboardOptions) => {
  const team = await getTeamById({ userId, teamId });
  const canViewOwner = team.currentTeamRole === TeamMemberRole.ADMIN || team.currentTeamRole === TeamMemberRole.MANAGER;
  const visibility = { in: TEAM_DOCUMENT_VISIBILITY_MAP[team.currentTeamRole] };
  const normalizedQuery = query?.trim();
  const itemType = type === 'TEMPLATE' ? EnvelopeType.TEMPLATE : EnvelopeType.DOCUMENT;

  const where: Prisma.FolderWhereInput = {
    ...(normalizedQuery ? {} : { parentId }),
    type,
    teamId,
    OR: [{ visibility }, { userId }],
    ...(normalizedQuery
      ? {
          AND: [
            {
              OR: [
                { name: { contains: normalizedQuery, mode: Prisma.QueryMode.insensitive } },
                ...(canViewOwner
                  ? [
                      { user: { name: { contains: normalizedQuery, mode: Prisma.QueryMode.insensitive } } },
                      { user: { email: { contains: normalizedQuery, mode: Prisma.QueryMode.insensitive } } },
                    ]
                  : []),
              ],
            },
          ],
        }
      : {}),
  };

  const countSelect = {
    envelopes: { where: { type: itemType, deletedAt: null } },
    subfolders: {
      where: {
        teamId,
        OR: [{ visibility }, { userId }],
      },
    },
  } satisfies Prisma.FolderCountOutputTypeSelect;

  const [folders, count] = await Promise.all([
    prisma.folder.findMany({
      where,
      skip: (Math.max(page, 1) - 1) * perPage,
      take: perPage,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      include: {
        user: { select: { name: true, email: true } },
        _count: { select: countSelect },
        subfolders: {
          where: {
            teamId,
            type,
            OR: [{ visibility }, { userId }],
            ...(normalizedQuery ? { id: { in: [] } } : {}),
          },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          include: {
            user: { select: { name: true, email: true } },
            _count: { select: countSelect },
          },
        },
      },
    }),
    prisma.folder.count({ where }),
  ]);

  const toFolder = (folder: (typeof folders)[number]) => {
    const { user, _count, subfolders, ...data } = folder;
    const itemCount = _count.envelopes;

    return {
      ...data,
      ...(canViewOwner ? { ownerName: getOwnerName(user) } : {}),
      subfolders: subfolders.map(({ user: subfolderUser, _count: subfolderCount, ...subfolder }) => ({
        ...subfolder,
        ...(canViewOwner ? { ownerName: getOwnerName(subfolderUser) } : {}),
        subfolders: [],
        _count: {
          documents: subfolder.type === 'DOCUMENT' ? subfolderCount.envelopes : 0,
          templates: subfolder.type === 'TEMPLATE' ? subfolderCount.envelopes : 0,
          subfolders: subfolderCount.subfolders,
        },
      })),
      _count: {
        documents: data.type === 'DOCUMENT' ? itemCount : 0,
        templates: data.type === 'TEMPLATE' ? itemCount : 0,
        subfolders: _count.subfolders,
      },
    };
  };

  return {
    folders: folders.map(toFolder),
    count,
    currentPage: Math.max(page, 1),
    perPage,
    totalPages: Math.max(1, Math.ceil(count / perPage)),
  };
};
