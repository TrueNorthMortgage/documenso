import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    recipient: {
      findMany: vi.fn(),
    },
    organisationMember: {
      findMany: vi.fn(),
    },
  },
  getTeamById: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('../team/get-team', () => ({ getTeamById: mocks.getTeamById }));

import { getRecipientSuggestions } from './get-recipient-suggestions';

describe('getRecipientSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getTeamById.mockResolvedValue({
      id: 1,
      organisationId: 'organisation_1',
    });
    mocks.prisma.recipient.findMany.mockResolvedValue([]);
    mocks.prisma.organisationMember.findMany.mockResolvedValue([]);
  });

  it('limits previous recipients to documents owned by the current user', async () => {
    await getRecipientSuggestions({ userId: 10, teamId: 1, query: 'person' });

    expect(mocks.prisma.recipient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          envelope: expect.objectContaining({
            type: 'DOCUMENT',
            userId: 10,
          }),
        }),
      }),
    );
  });

  it('includes matching users from the whole organisation', async () => {
    mocks.prisma.organisationMember.findMany.mockResolvedValue([
      {
        user: {
          email: 'member@example.com',
          name: 'Organisation Member',
        },
      },
    ]);

    await expect(getRecipientSuggestions({ userId: 10, teamId: 1, query: 'member' })).resolves.toEqual([
      {
        email: 'member@example.com',
        name: 'Organisation Member',
      },
    ]);

    expect(mocks.prisma.organisationMember.findMany).toHaveBeenCalledWith({
      where: {
        organisationId: 'organisation_1',
        user: {
          OR: [
            { name: { contains: 'member', mode: 'insensitive' } },
            { email: { contains: 'member', mode: 'insensitive' } },
          ],
        },
      },
      select: {
        user: {
          select: {
            email: true,
            name: true,
          },
        },
      },
      take: 5,
    });
  });

  it('does not exclude the current user from organisation suggestions', async () => {
    mocks.prisma.organisationMember.findMany.mockResolvedValue([
      {
        user: {
          email: 'juliano@example.com',
          name: 'Juliano',
        },
      },
    ]);

    await expect(getRecipientSuggestions({ userId: 10, teamId: 1, query: 'juliano' })).resolves.toEqual([
      {
        email: 'juliano@example.com',
        name: 'Juliano',
      },
    ]);
  });

  it('deduplicates recipients case-insensitively and keeps the five-result limit', async () => {
    mocks.prisma.recipient.findMany.mockResolvedValue([
      { email: 'person@example.com', name: 'Previous Contact' },
      { email: 'other@example.com', name: 'Other Contact' },
    ]);
    mocks.prisma.organisationMember.findMany.mockResolvedValue([
      { user: { email: 'PERSON@example.com', name: 'Organisation Member' } },
      { user: { email: 'member-1@example.com', name: 'Member 1' } },
      { user: { email: 'member-2@example.com', name: 'Member 2' } },
      { user: { email: 'member-3@example.com', name: 'Member 3' } },
      { user: { email: 'member-4@example.com', name: 'Member 4' } },
    ]);

    await expect(getRecipientSuggestions({ userId: 10, teamId: 1, query: 'person' })).resolves.toEqual([
      { email: 'person@example.com', name: 'Previous Contact' },
      { email: 'other@example.com', name: 'Other Contact' },
      { email: 'member-1@example.com', name: 'Member 1' },
      { email: 'member-2@example.com', name: 'Member 2' },
      { email: 'member-3@example.com', name: 'Member 3' },
    ]);
  });
});
