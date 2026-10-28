import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  rank: vi.fn(),
  getTeamById: vi.fn(),
  getMemberRoles: vi.fn(),
  getFolderPaths: vi.fn(),
}));
vi.mock('@documenso/prisma', () => ({ prisma: { envelope: { findMany: mocks.findMany } } }));
vi.mock('./find-ranked-template-ids', () => ({ findRankedTemplateIds: mocks.rank }));
vi.mock('../team/get-team', () => ({ getTeamById: mocks.getTeamById }));
vi.mock('../team/get-member-roles', () => ({ getMemberRoles: mocks.getMemberRoles }));
vi.mock('../folder/get-folder-paths', () => ({ getFolderPaths: mocks.getFolderPaths }));

import { findOrganisationTemplates } from './find-organisation-templates';
import { findTemplates } from './find-templates';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTeamById.mockResolvedValue({ organisationId: 'org_1', organisation: { name: 'TNM' } });
  mocks.getMemberRoles.mockResolvedValue({ teamRole: 'MEMBER' });
  mocks.getFolderPaths.mockResolvedValue(new Map());
  mocks.rank.mockResolvedValue({
    rows: [
      { id: 'favorite', isFavorite: true },
      { id: 'popular', isFavorite: false },
    ],
    count: 23,
  });
  // Hydration does not guarantee the order of an IN query.
  mocks.findMany.mockResolvedValue([
    { id: 'popular', folderId: null, team: { name: 'Team' } },
    { id: 'favorite', folderId: null, team: { name: 'Team' } },
  ]);
});

describe.each([
  ['team', findTemplates],
  ['organisation', findOrganisationTemplates],
] as const)('%s template list', (_, find) => {
  it('preserves database ranking and personal favorite state after hydration', async () => {
    const result = await find({ userId: 7, teamId: 12, page: 2, perPage: 10 });
    expect(result.data.map(({ id, isFavorite }) => ({ id, isFavorite }))).toEqual([
      { id: 'favorite', isFavorite: true },
      { id: 'popular', isFavorite: false },
    ]);
    expect(result).toMatchObject({ count: 23, currentPage: 2, perPage: 10, totalPages: 3 });
    expect(mocks.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['favorite', 'popular'] } });
    expect(mocks.rank).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, teamId: 12, visibility: ['EVERYONE'], page: 2, perPage: 10 }),
    );
  });

  it('returns an empty page while preserving the filtered total', async () => {
    mocks.rank.mockResolvedValue({ rows: [], count: 23 });
    mocks.findMany.mockResolvedValue([]);
    const result = await find({ userId: 7, teamId: 12, page: 4, perPage: 10 });
    expect(result).toMatchObject({ data: [], count: 23, currentPage: 4, totalPages: 3 });
  });
});
