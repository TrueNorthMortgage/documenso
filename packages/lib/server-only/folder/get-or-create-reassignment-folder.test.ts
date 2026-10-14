import type { Prisma } from '@prisma/client';
import { DocumentVisibility } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getOrCreateReassignmentFolder } from './get-or-create-reassignment-folder';

const lock = vi.fn();
const findFirst = vi.fn();
const create = vi.fn();
const update = vi.fn();
const tx = { $queryRaw: lock, folder: { findFirst, create, update } } as unknown as Prisma.TransactionClient;
const options = { tx, userId: 20, teamId: 1, visibility: DocumentVisibility.MANAGER_AND_ABOVE };

beforeEach(() => {
  vi.clearAllMocks();
  lock.mockResolvedValue([{ id: 20 }]);
  findFirst.mockResolvedValue(null);
  create.mockResolvedValue({ id: 'assigned_new' });
});

describe('reassignment destination folder', () => {
  it('reuses an existing root folder owned by the recipient in the same team', async () => {
    findFirst.mockResolvedValue({ id: 'existing', pinned: false });
    expect(await getOrCreateReassignmentFolder(options)).toEqual({ id: 'existing' });
    expect(create).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        userId: 20,
        teamId: 1,
        parentId: null,
        type: 'DOCUMENT',
        name: { equals: 'Assigned to you', mode: 'insensitive' },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, pinned: true },
    });
    expect(update).toHaveBeenCalledWith({ where: { id: 'existing' }, data: { pinned: true } });
  });

  it('keeps an already pinned folder unchanged', async () => {
    findFirst.mockResolvedValue({ id: 'existing', pinned: true });
    expect(await getOrCreateReassignmentFolder(options)).toEqual({ id: 'existing' });
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('creates a document folder in the new owner home with the team visibility default', async () => {
    expect(await getOrCreateReassignmentFolder(options)).toEqual({ id: 'assigned_new' });
    expect(create).toHaveBeenCalledWith({
      data: {
        name: 'Assigned to you',
        userId: 20,
        teamId: 1,
        parentId: null,
        type: 'DOCUMENT',
        visibility: 'MANAGER_AND_ABOVE',
        pinned: true,
      },
      select: { id: true },
    });
  });

  it('locks the owner before looking up or creating a folder so concurrent transfers serialize', async () => {
    await getOrCreateReassignmentFolder(options);
    expect(lock.mock.invocationCallOrder[0]).toBeLessThan(findFirst.mock.invocationCallOrder[0]);
    expect(findFirst.mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[0]);
    expect(lock.mock.calls[0][1]).toBe(20);
  });

  it('uses a parameterized owner ID in the lock', async () => {
    await getOrCreateReassignmentFolder(options);
    const [query, userId] = lock.mock.calls[0];
    expect(query.join('?')).toContain('WHERE id = ? AND disabled = false FOR UPDATE');
    expect(userId).toBe(20);
  });

  it('does not create a folder if the target account was removed or disabled', async () => {
    lock.mockResolvedValue([]);
    await expect(getOrCreateReassignmentFolder(options)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(findFirst).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('reuses the folder created by an earlier transfer rather than creating another', async () => {
    const first = await getOrCreateReassignmentFolder(options);
    findFirst.mockResolvedValue({ ...first, pinned: true });
    const second = await getOrCreateReassignmentFolder(options);
    expect(second).toEqual(first);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
