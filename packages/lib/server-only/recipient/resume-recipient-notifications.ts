import { prisma } from '@documenso/prisma';
import { DocumentStatus, EnvelopeType, RecipientRole, SigningStatus } from '@prisma/client';

import { AppError, AppErrorCode } from '../../errors/app-error';
import {
  DOCUMENT_AUDIT_LOG_TYPE,
  ZDocumentAuditLogEventRecipientNotificationsOptedOutSchema,
} from '../../types/document-audit-logs';
import type { ApiRequestMetadata } from '../../universal/extract-request-metadata';
import { createDocumentAuditLogData } from '../../utils/document-audit-logs';
import { canExecuteTeamAction } from '../../utils/teams';
import { getEnvelopeWhereInput } from '../envelope/get-envelope-by-id';
import { resolveResumedRecipientReminder } from './resolve-resumed-recipient-reminder';

export const resumeRecipientNotifications = async ({
  envelopeId,
  auditLogId,
  userId,
  teamId,
  requestMetadata,
}: {
  envelopeId: string;
  auditLogId: string;
  userId: number;
  teamId: number;
  requestMetadata: ApiRequestMetadata;
}) => {
  const { envelopeWhereInput, team } = await getEnvelopeWhereInput({
    id: { type: 'envelopeId', id: envelopeId },
    type: EnvelopeType.DOCUMENT,
    userId,
    teamId,
  });

  if (!canExecuteTeamAction('MANAGE_TEAM', team.currentTeamRole)) {
    throw new AppError(AppErrorCode.FORBIDDEN);
  }

  await prisma.$transaction(async (tx) => {
    const envelope = await tx.envelope.findFirst({
      where: {
        ...envelopeWhereInput,
        teamId,
        type: EnvelopeType.DOCUMENT,
        status: DocumentStatus.PENDING,
        deletedAt: null,
      },
      select: { id: true, documentMeta: true },
    });

    if (!envelope) {
      throw new AppError(AppErrorCode.NOT_FOUND, { userMessage: 'This envelope is no longer active or accessible.' });
    }

    const auditLog = await tx.documentAuditLog.findFirst({
      where: {
        id: auditLogId,
        envelopeId: envelope.id,
        type: DOCUMENT_AUDIT_LOG_TYPE.RECIPIENT_NOTIFICATIONS_OPTED_OUT,
      },
    });
    const parsedLog = ZDocumentAuditLogEventRecipientNotificationsOptedOutSchema.safeParse(auditLog);

    if (!parsedLog.success) {
      throw new AppError(AppErrorCode.NOT_FOUND, { message: 'Notification opt-out log not found' });
    }

    const optedOutAt = new Date(parsedLog.data.data.optedOutAt);
    const recipientWhere = {
      id: parsedLog.data.data.recipientId,
      envelopeId: envelope.id,
      notificationsOptedOutAt: optedOutAt,
      signingStatus: SigningStatus.NOT_SIGNED,
      role: { not: RecipientRole.CC },
    };
    const recipient = await tx.recipient.findFirst({ where: recipientWhere });

    if (!recipient) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        userMessage: 'This opt-out is no longer active. Refresh the envelope before trying again.',
      });
    }

    const nextReminderAt = resolveResumedRecipientReminder({ recipient, documentMeta: envelope.documentMeta });

    // Match the original opt-out so retries and old log entries cannot override a newer choice.
    const updated = await tx.recipient.updateMany({
      where: {
        ...recipientWhere,
        envelope: {
          ...envelopeWhereInput,
          teamId,
          type: EnvelopeType.DOCUMENT,
          status: DocumentStatus.PENDING,
          deletedAt: null,
        },
      },
      data: { notificationsOptedOutAt: null, nextReminderAt },
    });

    if (updated.count !== 1) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        userMessage: 'The recipient changed. Refresh the envelope before trying again.',
      });
    }

    await tx.documentAuditLog.create({
      data: createDocumentAuditLogData({
        type: DOCUMENT_AUDIT_LOG_TYPE.RECIPIENT_NOTIFICATIONS_RESUMED,
        envelopeId: envelope.id,
        metadata: requestMetadata,
        data: {
          recipientId: recipient.id,
          recipientName: recipient.name,
          recipientEmail: recipient.email,
          optOutAuditLogId: auditLogId,
        },
      }),
    });
  });
};
