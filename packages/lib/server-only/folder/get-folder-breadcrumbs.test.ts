import { DocumentVisibility, FolderType, TeamMemberRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findFirst: vi.fn(), getTeamById: vi.fn() }));

vi.mock('@documenso/prisma', () => ({ prisma: { folder: { findFirst: mocks.findFirst } } }));
vi.mock('../team/get-team', () => ({ getTeamById: mocks.getTeamById }));

import { getFolderBreadcrumbs } from './get-folder-breadcrumbs';

describe('getFolderBreadcrumbs', () => {
  const input = { userId: 1, teamId: 2, folderId: 'child', type: FolderType.DOCUMENT };

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getTeamById.mockResolvedValue({ currentTeamRole: TeamMemberRole.MEMBER });
  });

  it('orders a nested destination from the root to the current folder', async () => {
    mocks.findFirst
      .mockResolvedValueOnce({ id: 'child', name: 'Child', parentId: 'parent' })
      .mockResolvedValueOnce({ id: 'parent', name: 'Parent', parentId: 'root' })
      .mockResolvedValueOnce({ id: 'root', name: 'Root', parentId: null });

    const breadcrumbs = await getFolderBreadcrumbs(input);

    expect(breadcrumbs.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'root', name: 'Root' },
      { id: 'parent', name: 'Parent' },
      { id: 'child', name: 'Child' },
    ]);
    for (const [index, id] of ['child', 'parent', 'root'].entries()) {
      expect(mocks.findFirst).toHaveBeenNthCalledWith(index + 1, {
        where: {
          id,
          type: FolderType.DOCUMENT,
          OR: [
            { teamId: 2, visibility: DocumentVisibility.EVERYONE },
            { userId: 1, teamId: 2 },
          ],
        },
      });
    }
  });

  it('returns just the current folder when it is already at the root', async () => {
    mocks.findFirst.mockResolvedValueOnce({ id: 'child', name: 'Root folder', parentId: null });
    expect(await getFolderBreadcrumbs(input)).toHaveLength(1);
    expect(mocks.findFirst).toHaveBeenCalledTimes(1);
  });

  it('returns no destination when the current folder is inaccessible or missing', async () => {
    mocks.findFirst.mockResolvedValueOnce(null);
    expect(await getFolderBreadcrumbs(input)).toEqual([]);
    expect(mocks.findFirst).toHaveBeenCalledTimes(1);
  });

  it('stops at an inaccessible ancestor instead of exposing the rest of its path', async () => {
    mocks.findFirst
      .mockResolvedValueOnce({ id: 'child', name: 'Child', parentId: 'restricted' })
      .mockResolvedValueOnce(null);
    expect((await getFolderBreadcrumbs(input)).map(({ id }) => id)).toEqual(['child']);
    expect(mocks.findFirst).toHaveBeenCalledTimes(2);
  });

  it('uses the template type when resolving a template destination', async () => {
    mocks.findFirst.mockResolvedValueOnce(null);
    await getFolderBreadcrumbs({ ...input, type: FolderType.TEMPLATE });
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ type: FolderType.TEMPLATE, id: 'child' }),
    });
  });
});
