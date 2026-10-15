import { prisma } from '@documenso/prisma';
import { EnvelopeType, Prisma, TeamMemberRole } from '@prisma/client';

import { TEAM_DOCUMENT_VISIBILITY_MAP } from '../../constants/teams';
import type { TFolderType } from '../../types/folder-type';
import { getTeamById } from '../team/get-team';

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
  parentId,
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
        OR: [{ visibility }, { userId }],
      },
    },
  } satisfies Prisma.FolderCountOutputTypeSelect;

  const include = {
    user: { select: { name: true, email: true } },
    _count: { select: countSelect },
    subfolders: {
      where: {
        teamId,
        type,
        OR: [{ visibility }, { userId }],
        ...(normalizedQuery ? { id: { in: [] } } : {}),
      },
      orderBy,
      include: {
        user: { select: { name: true, email: true } },
        _count: { select: countSelect },
      },
    },
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

  // Batch each level and enforce access on every ancestor/descendant lookup.
  const depthLimit = Math.min(Math.max(childDepth, 1), 4);
  const contextInclude = {
    ...include,
    subfolders: { ...include.subfolders, where: { ...include.subfolders.where, id: { in: [] as string[] } } },
  };
  const searchParents: typeof folders = [];
  const descendants: typeof folders = [];
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
        orderBy,
        include: contextInclude,
      });
      for (const folder of currentFolders) {
        seen.add(folder.id);
        searchParents.push(folder);
      }
    }
  } else if (!normalizedQuery && depthLimit > 1) {
    let parentIds = folders.flatMap(({ subfolders }) => subfolders.map(({ id }) => id));
    for (const id of parentIds) {
      seen.add(id);
    }
    for (let depth = 1; depth < depthLimit && parentIds.length > 0; depth++) {
      const children = await prisma.folder.findMany({
        where: { parentId: { in: parentIds }, teamId, type, OR: [{ visibility }, { userId }] },
        orderBy,
        include: contextInclude,
      });
      const unseenChildren = children.filter(({ id }) => !seen.has(id));
      for (const folder of unseenChildren) {
        seen.add(folder.id);
        descendants.push(folder);
      }
      parentIds = unseenChildren.map(({ id }) => id);
    }
  }

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
    searchParents: searchParents.map(toFolder),
    descendants: descendants.map(toFolder),
    count,
    currentPage: Math.max(page, 1),
    perPage,
    totalPages: Math.max(1, Math.ceil(count / perPage)),
  };
};
