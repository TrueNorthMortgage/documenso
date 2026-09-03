import { AppErrorCode } from '@documenso/lib/errors/app-error';
import { DocumentVisibility, TeamMemberRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    folder: {
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
  },
  getTeamById: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('../team/get-team', () => ({ getTeamById: mocks.getTeamById }));

import { deleteFolder } from './delete-folder';

describe('deleteFolder', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getTeamById.mockResolvedValue({
      currentTeamRole: TeamMemberRole.MEMBER,
    });
  });

  it('rejects a member deleting a shared folder owned by someone else', async () => {
    mocks.prisma.folder.findFirst.mockResolvedValue({
      id: 'folder_1',
      userId: 1,
      visibility: DocumentVisibility.EVERYONE,
    });

    await expect(
      deleteFolder({
        userId: 2,
        teamId: 1,
        folderId: 'folder_1',
      }),
    ).rejects.toMatchObject({ code: AppErrorCode.FORBIDDEN });

    expect(mocks.prisma.folder.delete).not.toHaveBeenCalled();
  });

  it('allows a member to delete their own restricted folder', async () => {
    mocks.prisma.folder.findFirst.mockResolvedValue({
      id: 'folder_1',
      userId: 2,
      visibility: DocumentVisibility.MANAGER_AND_ABOVE,
    });
    mocks.prisma.folder.delete.mockResolvedValue({ id: 'folder_1' });

    await deleteFolder({
      userId: 2,
      teamId: 1,
      folderId: 'folder_1',
    });

    expect(mocks.prisma.folder.delete).toHaveBeenCalledWith({ where: { id: 'folder_1' } });
  });

  it('allows a manager to delete a shared folder owned by someone else', async () => {
    mocks.getTeamById.mockResolvedValue({
      currentTeamRole: TeamMemberRole.MANAGER,
    });
    mocks.prisma.folder.findFirst.mockResolvedValue({
      id: 'folder_1',
      userId: 1,
      visibility: DocumentVisibility.EVERYONE,
    });
    mocks.prisma.folder.delete.mockResolvedValue({ id: 'folder_1' });

    await deleteFolder({
      userId: 2,
      teamId: 1,
      folderId: 'folder_1',
    });

    expect(mocks.prisma.folder.delete).toHaveBeenCalled();
  });
});
