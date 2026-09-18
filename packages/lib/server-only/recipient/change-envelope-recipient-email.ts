import { DOCUMENT_AUDIT_LOG_TYPE } from '@documenso/lib/types/document-audit-logs';
import type { ApiRequestMetadata } from '@documenso/lib/universal/extract-request-metadata';
import { nanoid } from '@documenso/lib/universal/id';
import { createDocumentAuditLogData, diffRecipientChanges } from '@documenso/lib/utils/document-audit-logs';
import { mapSecondaryIdToDocumentId } from '@documenso/lib/utils/envelope';
import { prisma } from '@documenso/prisma';
import {
  DocumentStatus,
  EnvelopeType,
  Prisma,
  ReadStatus,
  RecipientRole,
  SendStatus,
  SigningStatus,
} from '@prisma/client';
import { resolveExpiresAt } from '../../constants/envelope-expiration';
import { AppError, AppErrorCode } from '../../errors/app-error';
import { jobs } from '../../jobs/client';
import { getEnvelopeWhereInput } from '../envelope/get-envelope-by-id';

export type ChangeEnvelopeRecipientEmailOptions = {
  envelopeId: string;
  recipientId: number;
  email: string;
  userId: number;
  teamId: number;
  requestMetadata: ApiRequestMetadata;
};

export const changeEnvelopeRecipientEmail = async ({
  envelopeId,
  recipientId,
  email,
  userId,
  teamId,
  requestMetadata,
}: ChangeEnvelopeRecipientEmailOptions) => {
  const { envelopeWhereInput } = await getEnvelopeWhereInput({
    id: {
      type: 'envelopeId',
      id: envelopeId,
    },
    type: EnvelopeType.DOCUMENT,
    userId,
    teamId,
  });

  const updatedRecipient = await prisma.$transaction(
    async (tx) => {
      const envelope = await tx.envelope.findFirst({
        where: envelopeWhereInput,
        include: {
          documentMeta: true,
          recipients: true,
        },
      });

      if (!envelope) {
        throw new AppError(AppErrorCode.NOT_FOUND, {
          message: 'Envelope not found',
        });
      }

      if (
        envelope.status !== DocumentStatus.PENDING ||
        envelope.internalVersion !== 2 ||
        envelope.correctionStartedAt ||
        !envelope.recipients.some(
          (recipient) => recipient.role !== RecipientRole.CC && recipient.signingStatus === SigningStatus.SIGNED,
        )
      ) {
        throw new AppError(AppErrorCode.INVALID_REQUEST, {
          message: 'Recipient email changes are only supported on active envelopes with completed recipients',
          userMessage: 'This recipient email can no longer be changed without creating a corrected copy.',
        });
      }

      const recipient = envelope.recipients.find((candidate) => candidate.id === recipientId);

      if (
        !recipient ||
        recipient.role === RecipientRole.CC ||
        recipient.signingStatus !== SigningStatus.NOT_SIGNED ||
        recipient.readStatus !== ReadStatus.NOT_OPENED
      ) {
        throw new AppError(AppErrorCode.INVALID_REQUEST, {
          message: 'Recipient is not eligible for an email change',
          userMessage: 'Only an unsigned recipient who has not opened the envelope can have their email changed.',
        });
      }

      const updatedEmail = email.toLowerCase();

      if (recipient.email === updatedEmail) {
        throw new AppError(AppErrorCode.INVALID_REQUEST, {
          message: 'Recipient email did not change',
          userMessage: 'Enter a different email address.',
        });
      }

      const updatedRecipient = await tx.recipient.update({
        where: {
          id: recipient.id,
          envelopeId: envelope.id,
        },
        data: {
          email: updatedEmail,
          token: nanoid(),
          sendStatus: SendStatus.NOT_SENT,
          sentAt: null,
          readStatus: ReadStatus.NOT_OPENED,
          lastReminderSentAt: null,
          nextReminderAt: null,
          expiresAt: resolveExpiresAt(envelope.documentMeta?.envelopeExpirationPeriod ?? null),
          expirationNotifiedAt: null,
        },
      });

      await tx.documentAuditLog.create({
        data: createDocumentAuditLogData({
          type: DOCUMENT_AUDIT_LOG_TYPE.RECIPIENT_UPDATED,
          envelopeId: envelope.id,
          metadata: requestMetadata,
          data: {
            recipientEmail: updatedRecipient.email,
            recipientName: updatedRecipient.name,
            recipientId: updatedRecipient.id,
            recipientRole: updatedRecipient.role,
            changes: diffRecipientChanges(recipient, updatedRecipient),
          },
        }),
      });

      return {
        recipient: updatedRecipient,
        documentId: mapSecondaryIdToDocumentId(envelope.secondaryId),
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );

  await jobs.triggerJob({
    name: 'send.signing.requested.email',
    payload: {
      userId,
      documentId: updatedRecipient.documentId,
      recipientId: updatedRecipient.recipient.id,
      requestMetadata: requestMetadata.requestMetadata,
    },
  });

  return updatedRecipient.recipient;
};
