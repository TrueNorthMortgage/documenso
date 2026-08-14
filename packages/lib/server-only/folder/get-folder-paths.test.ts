import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    folder: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@documenso/prisma', () => ({ prisma: mocks.prisma }));

import { getFolderPaths } from './get-folder-paths';

describe('getFolderPaths', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds paths for nested folders', async () => {
    const folders = [
      { id: 'child', name: 'Child', parentId: 'parent' },
      { id: 'parent', name: 'Parent', parentId: null },
    ];

    mocks.prisma.folder.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
      folders.filter((folder) => where.id.in.includes(folder.id)),
    );

    const paths = await getFolderPaths(['child']);

    expect(paths.get('child')).toBe('Parent / Child');
    expect(mocks.prisma.folder.findMany).toHaveBeenCalledTimes(2);
  });

  it('returns paths for root folders without querying when there are no folder ids', async () => {
    const paths = await getFolderPaths([]);

    expect(paths.size).toBe(0);
    expect(mocks.prisma.folder.findMany).not.toHaveBeenCalled();
  });
});
