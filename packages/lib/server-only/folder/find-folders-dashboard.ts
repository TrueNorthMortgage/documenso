import { prisma } from '@documenso/prisma';
import { EnvelopeType, Prisma, TeamMemberRole } from '@prisma/client';

import { TEAM_DOCUMENT_VISIBILITY_MAP } from '../../constants/teams';
import type { TFolderType } from '../../types/folder-type';
import { getTeamById } from '../team/get-team';
import { getFolderById } from './get-folder-by-id';

const getOwnerName = (user: { name: string | null; email: string }) => user.name || user.email;

export type FindFoldersDashboardOptions = {
  userId: number;
  teamId: number;
  parentId?: string | null;
  type?: TFolderType;
  query?: string;
  includeSearchParents?: boolean;
  childDepth?: number;
  page?: number;
  perPage?: number;
  sortBy?: 'name' | 'owner' | 'items' | 'subfolders';
  sortDirection?: 'asc' | 'desc';
};

/**
 * Fetch a folder-management page, batching additional hierarchy context per level.
 * This intentionally avoids the per-folder count and child-folder queries used by
 * the legacy folder picker.
 */
export const findFoldersDashboard = async ({
  userId,
  teamId,
  parentId = null,
  type,
  query,
  includeSearchParents = false,
  childDepth = 1,
  page = 1,
  perPage = 5,
  sortBy = 'name',
  sortDirection = 'asc',
}: FindFoldersDashboardOptions) => {
  const team = await getTeamById({ userId, teamId });
  if (parentId) {
    await getFolderById({ userId, teamId, folderId: parentId, type });
  }
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

  const orderBy: Prisma.FolderOrderByWithRelationInput[] = [
    { pinned: 'desc' },
    ...(sortBy === 'owner' && canViewOwner
      ? [{ user: { name: sortDirection } }]
      : sortBy === 'items'
        ? [{ envelopes: { _count: sortDirection } }]
        : sortBy === 'subfolders'
          ? [{ subfolders: { _count: sortDirection } }]
          : [{ name: sortDirection }]),
    { name: 'asc' },
    { id: 'asc' },
  ];

  const countSelect = {
    envelopes: { where: { type: itemType, deletedAt: null } },
    subfolders: {
      where: {
        teamId,
        type,
        OR: [{ visibility }, { userId }],
      },
    },
  } satisfies Prisma.FolderCountOutputTypeSelect;

  const include = {
    user: { select: { name: true, email: true } },
    _count: { select: countSelect },
  } satisfies Prisma.FolderInclude;

  const [folders, count] = await Promise.all([
    prisma.folder.findMany({
      where,
      skip: (Math.max(page, 1) - 1) * perPage,
      take: perPage,
      orderBy,
      include,
    }),
    prisma.folder.count({ where }),
  ]);

  // Search context has at most one accessible ancestor per match at each level.
  const depthLimit = Math.min(Math.max(childDepth, 1), 4);
  const searchParents: typeof folders = [];
  const seen = new Set(folders.map(({ id }) => id));
  if (normalizedQuery && includeSearchParents) {
    let currentFolders = folders;
    for (let depth = 0; depth < depthLimit; depth++) {
      const parentIds = [
        ...new Set(currentFolders.flatMap(({ parentId }) => (parentId && !seen.has(parentId) ? [parentId] : []))),
      ];
      if (parentIds.length === 0) {
        break;
      }
      currentFolders = await prisma.folder.findMany({
        where: { id: { in: parentIds }, teamId, type, OR: [{ visibility }, { userId }] },
        take: folders.length,
        orderBy,
        include,
      });
      for (const folder of currentFolders) {
        seen.add(folder.id);
        searchParents.push(folder);
      }
    }
  }

  const toFolder = (folder: (typeof folders)[number]) => {
    const { user, _count, ...data } = folder;
    const itemCount = _count.envelopes;

    return {
      ...data,
      ...(canViewOwner ? { ownerName: getOwnerName(user) } : {}),
      subfolders: [],
      _count: {
        documents: data.type === 'DOCUMENT' ? itemCount : 0,
        templates: data.type === 'TEMPLATE' ? itemCount : 0,
        subfolders: _count.subfolders,
      },
    };
  };

  return {
    folders: folders.map(toFolder),
    searchParents: searchParents.map(toFolder),

    count,
    currentPage: Math.max(page, 1),
    perPage,
    totalPages: Math.max(1, Math.ceil(count / perPage)),
  };
};
