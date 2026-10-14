import { prisma } from '@documenso/prisma';
import { EnvelopeType } from '@prisma/client';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { DOCUMENT_AUDIT_LOG_TYPE } from '../../types/document-audit-logs';
import type { ApiRequestMetadata } from '../../universal/extract-request-metadata';
import { createDocumentAuditLogData } from '../../utils/document-audit-logs';
import { isEnvelopeReassignable } from '../../utils/envelope-reassignment';
import { canExecuteTeamAction } from '../../utils/teams';
import { getOrCreateReassignmentFolder } from '../folder/get-or-create-reassignment-folder';
import { activeTeamMemberWhere } from '../team/get-reassignment-candidates';
import { getEnvelopeWhereInput } from './get-envelope-by-id';

export type ReassignEnvelopeSenderOptions = {
  envelopeId: string;
  userId: number;
  teamId: number;
  newOwnerId: number;
  expectedOwnerId: number;
  requestMetadata: ApiRequestMetadata;
};

export const reassignEnvelopeSender = async ({
  envelopeId,
  userId,
  teamId,
  newOwnerId,
  expectedOwnerId,
  requestMetadata,
}: ReassignEnvelopeSenderOptions) => {
  const { envelopeWhereInput, team } = await getEnvelopeWhereInput({
    id: { type: 'envelopeId', id: envelopeId },
    userId,
    teamId,
    type: EnvelopeType.DOCUMENT,
  });

  if (!canExecuteTeamAction('MANAGE_TEAM', team.currentTeamRole)) {
    throw new AppError(AppErrorCode.FORBIDDEN);
  }

  return await prisma.$transaction(async (tx) => {
    const envelope = await tx.envelope.findFirst({
      where: { ...envelopeWhereInput, teamId, type: EnvelopeType.DOCUMENT },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    if (!envelope) {
      throw new AppError(AppErrorCode.NOT_FOUND);
    }
    if (!isEnvelopeReassignable(envelope)) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        userMessage: 'Only draft, pending, or completed envelopes that have not been deleted can be reassigned.',
      });
    }
    if (envelope.userId !== expectedOwnerId) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        userMessage: 'The sender has changed. Refresh the document before reassigning it.',
      });
    }
    if (newOwnerId === envelope.userId) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, { userMessage: 'Choose a different sender.' });
    }

    const newOwner = await tx.user.findFirst({
      where: { ...activeTeamMemberWhere(teamId), id: newOwnerId },
      select: { id: true, name: true, email: true },
    });
    if (!newOwner) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        userMessage: 'The new sender must be an active member of this team.',
      });
    }

    const destination = await getOrCreateReassignmentFolder({
      tx,
      userId: newOwner.id,
      teamId,
      visibility: team.derivedSettings.documentVisibility,
    });

    // Compare the original owner, folder and lifecycle state before changing either relation.
    const updated = await tx.envelope.updateMany({
      where: {
        ...envelopeWhereInput,
        id: envelope.id,
        teamId,
        type: EnvelopeType.DOCUMENT,
        userId: envelope.userId,
        folderId: envelope.folderId,
        status: envelope.status,
        completedAt: envelope.completedAt,
        deletedAt: null,
      },
      data: { userId: newOwner.id, folderId: destination.id },
    });
    if (updated.count !== 1) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        userMessage: 'The document changed. Refresh it before reassigning the sender.',
      });
    }

    await tx.documentAuditLog.create({
      data: createDocumentAuditLogData({
        type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_SENDER_REASSIGNED,
        envelopeId: envelope.id,
        metadata: requestMetadata,
        data: {
          from: envelope.user,
          to: newOwner,
          previousFolderId: envelope.folderId,
          destinationFolderId: destination.id,
        },
      }),
    });

    return { id: envelope.id };
  });
};
