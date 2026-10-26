import { prisma } from '@documenso/prisma';
import { DocumentStatus, EnvelopeType, RecipientRole, SigningStatus } from '@prisma/client';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { DOCUMENT_AUDIT_LOG_TYPE } from '../../types/document-audit-logs';
import type { RequestMetadata } from '../../universal/extract-request-metadata';
import { createDocumentAuditLogData } from '../../utils/document-audit-logs';

export const optOutRecipientNotifications = async ({
  token,
  requestMetadata,
}: {
  token: string;
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
      select: { id: true, envelopeId: true, name: true, email: true },
    });

    if (!recipient) {
      throw new AppError(AppErrorCode.NOT_FOUND, { message: 'Invalid notification preference link' });
    }

    // Keep the original timestamp on repeated submissions and clear any scheduled reminder.
    const optedOutAt = new Date();
    const updated = await tx.recipient.updateMany({
      where: {
        ...activeRecipientWhere,
        id: recipient.id,
        envelopeId: recipient.envelopeId,
        notificationsOptedOutAt: null,
      },
      data: { notificationsOptedOutAt: optedOutAt, nextReminderAt: null },
    });

    if (updated.count === 1) {
      await tx.documentAuditLog.create({
        data: createDocumentAuditLogData({
          type: DOCUMENT_AUDIT_LOG_TYPE.RECIPIENT_NOTIFICATIONS_OPTED_OUT,
          envelopeId: recipient.envelopeId,
          user: { name: recipient.name, email: recipient.email },
          requestMetadata,
          data: {
            recipientId: recipient.id,
            recipientName: recipient.name,
            recipientEmail: recipient.email,
            optedOutAt: optedOutAt.toISOString(),
          },
        }),
      });
    }
  });
};
