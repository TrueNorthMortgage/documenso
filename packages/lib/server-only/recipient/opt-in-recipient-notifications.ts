import { prisma } from '@documenso/prisma';
import { DocumentStatus, EnvelopeType, RecipientRole, SigningStatus } from '@prisma/client';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { DOCUMENT_AUDIT_LOG_TYPE } from '../../types/document-audit-logs';
import type { RequestMetadata } from '../../universal/extract-request-metadata';
import { createDocumentAuditLogData } from '../../utils/document-audit-logs';
import { resolveResumedRecipientReminder } from './resolve-resumed-recipient-reminder';

export const optInRecipientNotifications = async ({
  token,
  optedOutAt,
  requestMetadata,
}: {
  token: string;
  optedOutAt: Date;
  requestMetadata?: RequestMetadata;
}) => {
  await prisma.$transaction(async (tx) => {
    const activeRecipientWhere = {
      token,
      signingStatus: SigningStatus.NOT_SIGNED,
      role: { not: RecipientRole.CC },
      envelope: { deletedAt: null, type: EnvelopeType.DOCUMENT, status: DocumentStatus.PENDING },
    };
    const recipient = await tx.recipient.findFirst({
      where: activeRecipientWhere,
      include: { envelope: { select: { documentMeta: true } } },
    });

    if (!recipient) {
      throw new AppError(AppErrorCode.NOT_FOUND, { message: 'Invalid or inactive notification preference link' });
    }

    // Repeated opt-ins are harmless, but an old form must not clear a newer opt-out.
    if (!recipient.notificationsOptedOutAt) {
      return;
    }

    if (recipient.notificationsOptedOutAt.getTime() !== optedOutAt.getTime()) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        userMessage: 'Your reminder preference has changed. Refresh this page before trying again.',
      });
    }

    const nextReminderAt = resolveResumedRecipientReminder({
      recipient,
      documentMeta: recipient.envelope.documentMeta,
    });
    const updated = await tx.recipient.updateMany({
      where: {
        ...activeRecipientWhere,
        id: recipient.id,
        envelopeId: recipient.envelopeId,
        notificationsOptedOutAt: optedOutAt,
      },
      data: { notificationsOptedOutAt: null, nextReminderAt },
    });

    if (updated.count !== 1) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        userMessage: 'Your reminder preference has changed. Refresh this page before trying again.',
      });
    }

    await tx.documentAuditLog.create({
      data: createDocumentAuditLogData({
        type: DOCUMENT_AUDIT_LOG_TYPE.RECIPIENT_NOTIFICATIONS_RESUMED,
        envelopeId: recipient.envelopeId,
        user: { name: recipient.name, email: recipient.email },
        requestMetadata,
        data: {
          recipientId: recipient.id,
          recipientName: recipient.name,
          recipientEmail: recipient.email,
          resumedByRecipient: true,
        },
      }),
    });
  });
};
