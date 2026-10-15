import type { DocumentVisibility, Prisma } from '@prisma/client';
import { FolderType } from '@prisma/client';

import { AppError, AppErrorCode } from '../../errors/app-error';

export const REASSIGNMENT_FOLDER_NAME = 'Assigned to you';

// Call inside the ownership-transfer transaction after validating the target's team membership.
export const getOrCreateReassignmentFolder = async ({
  tx,
  userId,
  teamId,
  visibility,
}: {
  tx: Prisma.TransactionClient;
  userId: number;
  teamId: number;
  visibility: DocumentVisibility;
}) => {
  // Serialize reassignment destinations for this owner, even before a folder exists.
  const owners = await tx.$queryRaw<{ id: number }[]>`
    SELECT id FROM "User" WHERE id = ${userId} AND disabled = false FOR UPDATE
  `;
  if (owners.length === 0) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      userMessage: 'The new sender is no longer available. Choose an active team member.',
    });
  }

  const folder = await tx.folder.findFirst({
    where: {
      userId,
      teamId,
      parentId: null,
      type: FolderType.DOCUMENT,
      name: { equals: REASSIGNMENT_FOLDER_NAME, mode: 'insensitive' },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, pinned: true },
  });
  if (folder) {
    if (!folder.pinned) {
      await tx.folder.update({ where: { id: folder.id }, data: { pinned: true } });
    }
    return { id: folder.id };
  }

  return await tx.folder.create({
    data: {
      name: REASSIGNMENT_FOLDER_NAME,
      userId,
      teamId,
      parentId: null,
      type: FolderType.DOCUMENT,
      visibility,
      pinned: true,
    },
    select: { id: true },
  });
};
