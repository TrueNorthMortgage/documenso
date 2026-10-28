import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
  getTeamById: vi.fn(),
  getMemberRoles: vi.fn(),
}));
vi.mock('@documenso/prisma', () => ({
  prisma: {
    envelope: { findFirst: mocks.findFirst },
    templateFavorite: { upsert: mocks.upsert, deleteMany: mocks.deleteMany },
  },
}));
vi.mock('../team/get-team', () => ({ getTeamById: mocks.getTeamById }));
vi.mock('../team/get-member-roles', () => ({ getMemberRoles: mocks.getMemberRoles }));

import { updateTemplateFavorite } from './update-template-favorite';

const input = { userId: 7, teamId: 12, envelopeId: 'envelope_1', isFavorite: true };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTeamById.mockResolvedValue({ organisationId: 'org_1' });
  mocks.getMemberRoles.mockResolvedValue({ teamRole: 'MEMBER' });
  mocks.findFirst.mockResolvedValue({ id: input.envelopeId });
});

describe('personal template favorites', () => {
  it('uses an idempotent upsert scoped to the authenticated user', async () => {
    expect(await updateTemplateFavorite(input)).toEqual({ isFavorite: true });
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { userId_envelopeId: { userId: 7, envelopeId: 'envelope_1' } },
      create: { userId: 7, envelopeId: 'envelope_1' },
      update: {},
    });
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it('removes only the current user favorite and tolerates an already removed favorite', async () => {
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    expect(await updateTemplateFavorite({ ...input, isFavorite: false })).toEqual({ isFavorite: false });
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { userId: 7, envelopeId: 'envelope_1' } });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('rejects missing, inaccessible and document IDs before writing', async () => {
    mocks.findFirst.mockResolvedValue(null);
    await expect(updateTemplateFavorite(input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'envelope_1',
        type: 'TEMPLATE',
        OR: [
          { teamId: 12, OR: [{ visibility: { in: ['EVERYONE'] } }, { userId: 7 }] },
          { templateType: 'ORGANISATION', team: { organisationId: 'org_1' }, visibility: { in: ['EVERYONE'] } },
        ],
      },
      select: { id: true },
    });
  });

  it('rejects callers without team access before writing', async () => {
    mocks.getTeamById.mockRejectedValueOnce(new Error('Forbidden'));
    await expect(updateTemplateFavorite(input)).rejects.toThrow('Forbidden');
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
