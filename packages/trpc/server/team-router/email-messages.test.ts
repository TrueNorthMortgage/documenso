import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), deleteMany: vi.fn(), getTeam: vi.fn() }));

vi.mock('@documenso/prisma', () => ({
  prisma: { emailMessage: { findMany: mocks.findMany, deleteMany: mocks.deleteMany } },
}));
vi.mock('@documenso/lib/server-only/team/get-team', () => ({ getTeamById: mocks.getTeam }));
vi.mock('../trpc', () => ({
  authenticatedProcedure: {
    input: () => ({ query: (handler: unknown) => handler, mutation: (handler: unknown) => handler }),
  },
}));

import type { z } from 'zod';
import { deletePersonalEmailMessageRoute } from './delete-personal-email-message';
import { findEmailMessagesRoute } from './find-email-messages';
import type { ZFindEmailMessagesRequestSchema } from './find-email-messages.types';

const ctx = { user: { id: 2 } };
const find = findEmailMessagesRoute as unknown as (options: {
  input: z.infer<typeof ZFindEmailMessagesRequestSchema>;
  ctx: typeof ctx;
}) => Promise<{ id: string; isPersonal: boolean; isFavorite: boolean }[]>;
const deleteMessage = deletePersonalEmailMessageRoute as unknown as (options: {
  input: { teamId: number; id: string };
  ctx: typeof ctx;
}) => Promise<void>;

const makeMessages = (prefix: string, count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    ownerId: prefix === 'template' ? null : 2,
    favorites: prefix === 'favorite' ? [{ userId: 2 }] : [],
  }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getTeam.mockResolvedValue({});
});

describe('send popup message limit', () => {
  it.each(['', 'signature'])('caps the combined results at five for query "%s"', async (query) => {
    mocks.findMany
      .mockResolvedValueOnce(makeMessages('favorite', 2))
      .mockResolvedValueOnce(makeMessages('template', 2))
      .mockResolvedValueOnce(makeMessages('recent', 5));

    const result = await find({ input: { teamId: 1, query, teamOnly: false, limit: 5 }, ctx });

    expect(result.map(({ id }) => id)).toEqual(['favorite-0', 'favorite-1', 'template-0', 'template-1', 'recent-0']);
    expect(mocks.findMany.mock.calls.every(([options]) => options.take === 5)).toBe(true);
    expect(result[0].isFavorite).toBe(true);
    expect(result[2].isPersonal).toBe(false);
  });

  it('keeps all team templates available on the admin page', async () => {
    mocks.findMany
      .mockResolvedValueOnce(makeMessages('favorite', 2))
      .mockResolvedValueOnce(makeMessages('template', 8));

    const result = await find({ input: { teamId: 1, query: '', teamOnly: true }, ctx });

    expect(result).toHaveLength(10);
    expect(mocks.findMany).toHaveBeenCalledTimes(2);
    expect(mocks.findMany.mock.calls.every(([options]) => options.take === undefined)).toBe(true);
  });
});

describe('permanent personal message deletion', () => {
  it('deletes only the signed-in user’s message within the requested team', async () => {
    mocks.deleteMany.mockResolvedValue({ count: 1 });

    await deleteMessage({ input: { teamId: 1, id: 'personal-message' }, ctx });

    expect(mocks.getTeam).toHaveBeenCalledWith({ teamId: 1, userId: 2 });
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { id: 'personal-message', teamId: 1, ownerId: 2 },
    });
  });

  it('returns not found when no owned message matches', async () => {
    mocks.deleteMany.mockResolvedValue({ count: 0 });

    await expect(
      deleteMessage({ input: { teamId: 1, id: 'shared-or-other-user-message' }, ctx }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('does not delete anything when team access is denied', async () => {
    mocks.getTeam.mockRejectedValue(new Error('Team access denied'));

    await expect(deleteMessage({ input: { teamId: 1, id: 'personal-message' }, ctx })).rejects.toThrow(
      'Team access denied',
    );
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });
});
