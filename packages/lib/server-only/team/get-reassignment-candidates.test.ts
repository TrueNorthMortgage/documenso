import { TeamMemberRole } from '@prisma/client';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getTeam: vi.fn(), findMany: vi.fn() }));
vi.mock('@documenso/prisma', () => ({ prisma: { user: { findMany: mocks.findMany } } }));
vi.mock('./get-team', () => ({ getTeamById: mocks.getTeam }));

import { getReassignmentCandidates } from './get-reassignment-candidates';

beforeEach(() => {
  vi.clearAllMocks();
});

it('only queries enabled members of the selected team for managers', async () => {
  mocks.getTeam.mockResolvedValue({ currentTeamRole: TeamMemberRole.MANAGER });
  mocks.findMany.mockResolvedValue([]);
  await getReassignmentCandidates({ userId: 1, teamId: 2 });
  expect(mocks.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        disabled: false,
        organisationMember: {
          some: { organisationGroupMembers: { some: { group: { teamGroups: { some: { teamId: 2 } } } } } },
        },
      },
      select: { id: true, name: true, email: true },
    }),
  );
});

it('does not expose reassignment candidates to ordinary members', async () => {
  mocks.getTeam.mockResolvedValue({ currentTeamRole: TeamMemberRole.MEMBER });
  await expect(getReassignmentCandidates({ userId: 1, teamId: 2 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(mocks.findMany).not.toHaveBeenCalled();
});
