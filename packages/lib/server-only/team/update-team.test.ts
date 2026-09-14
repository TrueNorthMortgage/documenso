import { AppErrorCode } from '@documenso/lib/errors/app-error';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    team: {
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
      update: vi.fn(),
    },
    organisation: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@documenso/prisma', () => ({ prisma: mocks.prisma }));

import { updateTeam } from './update-team';

describe('updateTeam', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.team.findFirstOrThrow.mockResolvedValue({ url: 'current-team' });
    mocks.prisma.team.findFirst.mockResolvedValue(null);
    mocks.prisma.organisation.findFirst.mockResolvedValue(null);
    mocks.prisma.team.update.mockResolvedValue({});
  });

  it('allows updating the display name when the team URL is unchanged', async () => {
    await updateTeam({
      userId: 1,
      teamId: 1,
      data: {
        displayName: 'Customer-facing name',
        url: 'current-team',
      },
    });

    expect(mocks.prisma.organisation.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.team.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.team.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ displayName: 'Customer-facing name' }),
      }),
    );
  });

  it('still rejects a URL already used by an organisation when changing the team URL', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.prisma.team.findFirstOrThrow.mockResolvedValue({ url: 'old-team-url' });
    mocks.prisma.organisation.findFirst.mockResolvedValue({ id: 'organisation-1' });

    await expect(
      updateTeam({
        userId: 1,
        teamId: 1,
        data: {
          displayName: 'Customer-facing name',
          url: 'existing-organisation-url',
        },
      }),
    ).rejects.toMatchObject({ code: AppErrorCode.ALREADY_EXISTS });

    expect(mocks.prisma.team.update).not.toHaveBeenCalled();
  });
});
