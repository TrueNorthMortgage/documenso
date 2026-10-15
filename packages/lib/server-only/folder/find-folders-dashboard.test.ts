import { DocumentVisibility, TeamMemberRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn(), getTeam: vi.fn() }));
vi.mock('@documenso/prisma', () => ({ prisma: { folder: { findMany: mocks.findMany, count: mocks.count } } }));
vi.mock('../team/get-team', () => ({ getTeamById: mocks.getTeam }));

import { findFoldersDashboard } from './find-folders-dashboard';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTeam.mockResolvedValue({ currentTeamRole: TeamMemberRole.ADMIN });
  mocks.count.mockResolvedValue(14);
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
      subfolders: [],
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
        orderBy: [{ pinned: 'desc' }, { name: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(result.folders[0]).not.toHaveProperty('ownerName');
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
    subfolders: [],
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

  it('loads four descendant levels in batches while preserving root pagination', async () => {
    const root = { ...folder('root', null), subfolders: [folder('level-1', 'root')] };
    mocks.count.mockResolvedValue(1);
    mocks.findMany
      .mockResolvedValueOnce([root])
      .mockResolvedValueOnce([folder('level-2', 'level-1')])
      .mockResolvedValueOnce([folder('level-3', 'level-2')])
      .mockResolvedValueOnce([folder('level-4', 'level-3')]);
    const result = await findFoldersDashboard({
      userId: 1,
      teamId: 2,
      type: 'DOCUMENT',
      parentId: null,
      childDepth: 4,
    });
    expect(result.descendants.map(({ id }) => id)).toEqual(['level-2', 'level-3', 'level-4']);
    expect(result.folders[0].subfolders[0].id).toBe('level-1');
    expect(result.count).toBe(1);
    expect(mocks.findMany).toHaveBeenCalledTimes(4);
    for (const [index, parentId] of ['level-1', 'level-2', 'level-3'].entries()) {
      expect(mocks.findMany.mock.calls[index + 1][0].where).toMatchObject({
        parentId: { in: [parentId] },
        teamId: 2,
        type: 'DOCUMENT',
        OR: expect.arrayContaining([{ userId: 1 }]),
      });
    }
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

  it('stops traversing descendants at an inaccessible level', async () => {
    mocks.findMany
      .mockResolvedValueOnce([{ ...folder('root', null), subfolders: [folder('visible-child', 'root')] }])
      .mockResolvedValueOnce([]);
    const result = await findFoldersDashboard({ userId: 1, teamId: 2, childDepth: 4 });
    expect(result.descendants).toEqual([]);
    expect(mocks.findMany).toHaveBeenCalledTimes(2);
  });
});
