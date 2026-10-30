import { AppErrorCode } from '@documenso/lib/errors/app-error';
import { DocumentVisibility } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ create: vi.fn(), getTeamSettings: vi.fn() }));

vi.mock('@documenso/prisma', () => ({ prisma: { folder: { create: mocks.create } } }));
vi.mock('../team/get-team-settings', () => ({ getTeamSettings: mocks.getTeamSettings }));

import { createFolder } from './create-folder';

describe('folder creation validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTeamSettings.mockResolvedValue({ documentVisibility: DocumentVisibility.EVERYONE });
    mocks.create.mockResolvedValue({ id: 'folder_1' });
  });

  it.each([
    'invalid\u0000name',
    'x'.repeat(256),
    '   ',
  ])('rejects invalid name %j before database access', async (name) => {
    await expect(createFolder({ userId: 1, teamId: 2, name })).rejects.toMatchObject({
      code: AppErrorCode.INVALID_BODY,
    });
    expect(mocks.getTeamSettings).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('persists the normalized valid name', async () => {
    await createFolder({ userId: 1, teamId: 2, name: '  Folder name  ' });
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Folder name' }) }),
    );
  });
});
