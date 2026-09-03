import { AppErrorCode } from '@documenso/lib/errors/app-error';
import { DocumentVisibility, TeamMemberRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    folder: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  getTeamById: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('../team/get-team', () => ({ getTeamById: mocks.getTeamById }));

import { updateFolder } from './update-folder';

describe('updateFolder', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getTeamById.mockResolvedValue({
      currentTeamRole: TeamMemberRole.MEMBER,
    });
  });

  it('rejects a member updating a shared folder owned by someone else', async () => {
    mocks.prisma.folder.findFirst.mockResolvedValue({
      id: 'folder_1',
      userId: 1,
      visibility: DocumentVisibility.EVERYONE,
    });

    await expect(
      updateFolder({
        userId: 2,
        teamId: 1,
        folderId: 'folder_1',
        data: { name: 'Updated folder' },
      }),
    ).rejects.toMatchObject({ code: AppErrorCode.FORBIDDEN });

    expect(mocks.prisma.folder.update).not.toHaveBeenCalled();
  });

  it('allows a member to update their own restricted folder', async () => {
    const folder = {
      id: 'folder_1',
      userId: 2,
      visibility: DocumentVisibility.MANAGER_AND_ABOVE,
    };

    mocks.prisma.folder.findFirst.mockResolvedValue(folder);
    mocks.prisma.folder.update.mockResolvedValue({ ...folder, name: 'Updated folder' });

    await expect(
      updateFolder({
        userId: 2,
        teamId: 1,
        folderId: 'folder_1',
        data: { name: 'Updated folder' },
      }),
    ).resolves.toMatchObject({ name: 'Updated folder' });

    expect(mocks.prisma.folder.update).toHaveBeenCalled();
  });

  it('allows a manager to update a shared folder owned by someone else', async () => {
    mocks.getTeamById.mockResolvedValue({
      currentTeamRole: TeamMemberRole.MANAGER,
    });
    mocks.prisma.folder.findFirst.mockResolvedValue({
      id: 'folder_1',
      userId: 1,
      visibility: DocumentVisibility.EVERYONE,
    });
    mocks.prisma.folder.update.mockResolvedValue({ id: 'folder_1' });

    await updateFolder({
      userId: 2,
      teamId: 1,
      folderId: 'folder_1',
      data: { name: 'Updated folder' },
    });

    expect(mocks.prisma.folder.update).toHaveBeenCalled();
  });
});
