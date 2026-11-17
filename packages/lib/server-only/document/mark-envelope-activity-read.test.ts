import { ZMarkEnvelopeActivityReadRequestSchema } from '@documenso/trpc/server/envelope-router/mark-envelope-activity-read.types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getTeamById: vi.fn(),
  findMany: vi.fn(),
  createMany: vi.fn(),
}));
vi.mock('@documenso/prisma', () => ({
  prisma: {
    documentAuditLog: { findMany: mocks.findMany },
    envelopeActivityRead: { createMany: mocks.createMany },
  },
}));
vi.mock('../team/get-team', () => ({ getTeamById: mocks.getTeamById }));

import { markEnvelopeActivityRead } from './mark-envelope-activity-read';

describe('markEnvelopeActivityRead', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getTeamById.mockResolvedValue({ id: 3 });
    mocks.findMany.mockResolvedValue([{ id: 'allowed' }]);
    mocks.createMany.mockResolvedValue({ count: 1 });
  });

  it('persists only authorized events and makes retries idempotent', async () => {
    await expect(
      markEnvelopeActivityRead({ userId: 12, teamId: 3, eventIds: ['allowed', 'forbidden'] }),
    ).resolves.toEqual({ success: true });

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['allowed', 'forbidden'] },
          envelope: { userId: 12, teamId: 3, type: 'DOCUMENT', deletedAt: null },
        }),
      }),
    );
    expect(mocks.createMany).toHaveBeenCalledWith({
      data: [{ userId: 12, auditLogId: 'allowed' }],
      skipDuplicates: true,
    });
  });

  it('does not write markers when the team is inaccessible', async () => {
    const error = new Error('Team not found');
    mocks.getTeamById.mockRejectedValue(error);

    await expect(markEnvelopeActivityRead({ userId: 12, teamId: 3, eventIds: ['event'] })).rejects.toBe(error);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it('propagates a failed write so the client can retain its legacy markers and retry', async () => {
    mocks.createMany.mockRejectedValue(new Error('Database unavailable'));

    await expect(markEnvelopeActivityRead({ userId: 12, teamId: 3, eventIds: ['allowed'] })).rejects.toThrow(
      'Database unavailable',
    );
  });

  it('accepts a full migration batch', () => {
    expect(
      ZMarkEnvelopeActivityReadRequestSchema.safeParse({
        teamId: 3,
        eventIds: Array.from({ length: 100 }, (_, index) => `event-${index}`),
      }).success,
    ).toBe(true);
  });

  it.each([
    { eventIds: [] },
    { eventIds: Array.from({ length: 101 }, (_, index) => `event-${index}`) },
    { eventIds: ['x'.repeat(129)] },
    { eventIds: [''] },
  ])('rejects an empty, oversized, or invalid batch', ({ eventIds }) => {
    expect(ZMarkEnvelopeActivityReadRequestSchema.safeParse({ teamId: 3, eventIds }).success).toBe(false);
  });
});
