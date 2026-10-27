import { DocumentVisibility, TeamMemberRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn(), getTeam: vi.fn(), getFolder: vi.fn() }));
vi.mock('@documenso/prisma', () => ({ prisma: { folder: { findMany: mocks.findMany, count: mocks.count } } }));
vi.mock('../team/get-team', () => ({ getTeamById: mocks.getTeam }));
vi.mock('./get-folder-by-id', () => ({ getFolderById: mocks.getFolder }));

import { findFoldersDashboard } from './find-folders-dashboard';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTeam.mockResolvedValue({ currentTeamRole: TeamMemberRole.ADMIN });
  mocks.count.mockResolvedValue(14);
  mocks.getFolder.mockResolvedValue({ id: 'parent' });
  mocks.findMany.mockImplementation(async ({ skip, take }) =>
    Array.from({ length: Math.min(take, 14 - skip) }, (_, index) => ({
      id: `folder_${skip + index}`,
      name: `Folder ${skip + index}`,
      userId: 1,
      teamId: 2,
      parentId: null,
      type: 'DOCUMENT',
      pinned: false,
      visibility: DocumentVisibility.MANAGER_AND_ABOVE,
      user: { name: 'Owner', email: 'owner@example.com' },
      _count: { envelopes: 3, subfolders: 0 },
    })),
  );
});

describe('folder card page loading', () => {
  it('loads distinct batches and stops at the final page while retaining card metadata', async () => {
    const options = { userId: 1, teamId: 2, parentId: null, type: 'DOCUMENT' as const, perPage: 6 };
    const pages = await Promise.all([1, 2, 3].map((page) => findFoldersDashboard({ ...options, page })));
    expect(pages.map((page) => page.folders.length)).toEqual([6, 6, 2]);
    expect(new Set(pages.flatMap((page) => page.folders.map((folder) => folder.id))).size).toBe(14);
    expect(pages.map(({ currentPage, totalPages }) => currentPage < totalPages)).toEqual([true, true, false]);
    expect(pages[0].folders[0]).toMatchObject({
      ownerName: 'Owner',
      pinned: false,
      _count: { documents: 3, subfolders: 0 },
    });
  });

  it('retains team visibility filtering and pinned-first deterministic ordering on later pages', async () => {
    mocks.getTeam.mockResolvedValue({ currentTeamRole: TeamMemberRole.MEMBER });
    const result = await findFoldersDashboard({
      userId: 1,
      teamId: 2,
      parentId: null,
      type: 'DOCUMENT',
      perPage: 6,
      page: 2,
    });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 6,
        take: 6,
        where: expect.objectContaining({
          teamId: 2,
          parentId: null,
          type: 'DOCUMENT',
          OR: expect.arrayContaining([{ userId: 1 }]),
        }),
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }, { name: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(result.folders[0]).not.toHaveProperty('ownerName');
  });
});

describe('folder sort choices', () => {
  it.each(['DOCUMENT', 'TEMPLATE'] as const)('defaults %s folders to newest first before pagination', async (type) => {
    await findFoldersDashboard({ userId: 1, teamId: 2, type, perPage: 6 });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 6,
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }, { name: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('retains explicit alphabetical sorting', async () => {
    await findFoldersDashboard({ userId: 1, teamId: 2, sortBy: 'name', sortDirection: 'asc' });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ pinned: 'desc' }, { name: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      }),
    );
  });
});

describe('folder search parent context', () => {
  const folder = (id: string, parentId: string | null) => ({
    id,
    parentId,
    name: id,
    userId: 1,
    teamId: 2,
    type: 'DOCUMENT',
    pinned: false,
    visibility: DocumentVisibility.MANAGER_AND_ABOVE,
    user: { name: 'Owner', email: 'owner@example.com' },
    _count: { envelopes: 0, subfolders: 1 },
  });

  it('finds nested matches and adds an accessible parent without changing pagination', async () => {
    mocks.count.mockResolvedValue(1);
    mocks.findMany
      .mockResolvedValueOnce([folder('matching-child', 'parent')])
      .mockResolvedValueOnce([folder('parent', null)]);
    const result = await findFoldersDashboard({
      userId: 1,
      teamId: 2,
      type: 'DOCUMENT',
      parentId: null,
      query: 'matching',
      includeSearchParents: true,
    });
    expect(mocks.findMany.mock.calls[0][0].where).not.toHaveProperty('parentId');
    expect(mocks.findMany.mock.calls[1][0].where).toMatchObject({
      id: { in: ['parent'] },
      teamId: 2,
      type: 'DOCUMENT',
      OR: expect.arrayContaining([{ userId: 1 }]),
    });
    expect(result.folders.map(({ id }) => id)).toEqual(['matching-child']);
    expect(result.searchParents.map(({ id }) => id)).toEqual(['parent']);
    expect(result.count).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it('keeps a visible match when its parent is inaccessible and omits owner data for members', async () => {
    mocks.getTeam.mockResolvedValue({ currentTeamRole: TeamMemberRole.MEMBER });
    mocks.findMany.mockResolvedValueOnce([folder('matching-child', 'private-parent')]).mockResolvedValueOnce([]);
    const result = await findFoldersDashboard({ userId: 1, teamId: 2, query: 'matching', includeSearchParents: true });
    expect(result.folders[0].id).toBe('matching-child');
    expect(result.folders[0]).not.toHaveProperty('ownerName');
    expect(result.searchParents).toEqual([]);
  });

  it('does not fetch parent context for grid search or duplicate a matching parent', async () => {
    mocks.findMany.mockResolvedValueOnce([folder('matching-child', 'parent')]);
    await findFoldersDashboard({ userId: 1, teamId: 2, query: 'matching' });
    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    mocks.findMany.mockClear();
    mocks.findMany.mockResolvedValueOnce([folder('matching-child', 'parent'), folder('parent', null)]);
    const result = await findFoldersDashboard({ userId: 1, teamId: 2, query: 'matching', includeSearchParents: true });
    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(result.searchParents).toEqual([]);
  });

  it('does not fetch collapsed branches even when four levels are requested', async () => {
    mocks.findMany.mockResolvedValueOnce([folder('root', null)]);
    const result = await findFoldersDashboard({
      userId: 1,
      teamId: 2,
      type: 'DOCUMENT',
      parentId: null,
      childDepth: 4,
    });
    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.findMany.mock.calls[0][0].include).not.toHaveProperty('subfolders');
    expect(result.folders[0].subfolders).toEqual([]);
    expect(result.folders[0]._count.subfolders).toBe(1);
  });

  it('loads expanded children in bounded distinct pages with authorization and visibility filters', async () => {
    const options = { userId: 1, teamId: 2, type: 'DOCUMENT' as const, parentId: 'parent', perPage: 6 };
    const pages = await Promise.all([1, 2, 3].map((page) => findFoldersDashboard({ ...options, page })));
    expect(pages.map(({ folders }) => folders.length)).toEqual([6, 6, 2]);
    expect(new Set(pages.flatMap(({ folders }) => folders.map(({ id }) => id))).size).toBe(14);
    expect(mocks.getFolder).toHaveBeenCalledWith({ userId: 1, teamId: 2, folderId: 'parent', type: 'DOCUMENT' });
    for (const [args] of mocks.findMany.mock.calls) {
      expect(args).toMatchObject({
        take: 6,
        where: { parentId: 'parent', teamId: 2, type: 'DOCUMENT', OR: expect.arrayContaining([{ userId: 1 }]) },
      });
      expect(args.include).not.toHaveProperty('subfolders');
    }
  });

  it('rejects inaccessible or cross-team parents before querying any children', async () => {
    mocks.getFolder.mockRejectedValueOnce(new Error('Folder not found'));
    await expect(findFoldersDashboard({ userId: 1, teamId: 2, parentId: 'private-parent' })).rejects.toThrow(
      'Folder not found',
    );
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.count).not.toHaveBeenCalled();
  });

  it('opens up to four accessible ancestors for a deep search match', async () => {
    mocks.findMany
      .mockResolvedValueOnce([folder('match', 'level-3')])
      .mockResolvedValueOnce([folder('level-3', 'level-2')])
      .mockResolvedValueOnce([folder('level-2', 'level-1')])
      .mockResolvedValueOnce([folder('level-1', 'root')])
      .mockResolvedValueOnce([folder('root', null)]);
    const result = await findFoldersDashboard({
      userId: 1,
      teamId: 2,
      query: 'match',
      includeSearchParents: true,
      childDepth: 4,
    });
    expect(result.searchParents.map(({ id }) => id)).toEqual(['level-3', 'level-2', 'level-1', 'root']);
    expect(result.folders.map(({ id }) => id)).toEqual(['match']);
    expect(mocks.findMany).toHaveBeenCalledTimes(5);
  });

  it('limits ancestor lookups to the matched row count and hides owner identities from members', async () => {
    mocks.getTeam.mockResolvedValue({ currentTeamRole: TeamMemberRole.MEMBER });
    mocks.findMany.mockResolvedValueOnce([folder('child', 'parent')]).mockResolvedValueOnce([folder('parent', null)]);
    const result = await findFoldersDashboard({
      userId: 1,
      teamId: 2,
      query: 'child',
      includeSearchParents: true,
      childDepth: 4,
    });
    expect(mocks.findMany.mock.calls[1][0]).toMatchObject({
      take: 1,
      where: { teamId: 2, OR: expect.arrayContaining([{ userId: 1 }]) },
    });
    expect(result.searchParents[0]).not.toHaveProperty('ownerName');
    expect(result.searchParents[0]).not.toHaveProperty('user');
    expect(result.searchParents[0]).not.toHaveProperty('email');
  });
});
