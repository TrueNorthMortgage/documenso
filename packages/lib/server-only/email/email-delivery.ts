import { prisma } from '@documenso/prisma';
import type { EmailDeliveryAttempt } from '@prisma/client';
import { EmailDeliveryStatus, Prisma } from '@prisma/client';

import { DOCUMENT_AUDIT_LOG_TYPE } from '../../types/document-audit-logs';
import { reduceEmailDeliveryStatus } from '../../universal/email-delivery';
import { createDocumentAuditLogData } from '../../utils/document-audit-logs';
import type { NormalizedPostmarkEvent } from './postmark-event';

/** Serialize changes to the same attempt; concurrent webhook/send transactions retry on conflict. */
export const withEmailDeliveryTransaction = async <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(callback, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 3) {
        continue;
      }

      throw error;
    }
  }
};

export const applyEmailDeliveryStatus = async (
  tx: Prisma.TransactionClient,
  attempt: EmailDeliveryAttempt,
  incoming: { status: EmailDeliveryStatus; occurredAt: Date; failureCode: string | null },
) => {
  const status = reduceEmailDeliveryStatus(attempt, incoming);

  if (status === attempt.status) {
    return;
  }

  await tx.emailDeliveryAttempt.update({
    where: { id: attempt.id },
    data: { status, statusAt: incoming.occurredAt, failureCode: incoming.failureCode },
  });

  // A corrected address, newer resend or deleted recipient must not inherit an old failure.
  await tx.recipient.updateMany({
    where: {
      id: attempt.recipientId,
      latestEmailDeliveryAttemptId: attempt.id,
      email: { equals: attempt.recipientEmail, mode: 'insensitive' },
    },
    data: { emailDeliveryStatus: status },
  });

  if ([EmailDeliveryStatus.PENDING, EmailDeliveryStatus.ACCEPTED].some((value) => value === status)) {
    return;
  }

  const recipient = await tx.recipient.findUniqueOrThrow({ where: { id: attempt.recipientId } });

  await tx.documentAuditLog.create({
    data: createDocumentAuditLogData({
      type: DOCUMENT_AUDIT_LOG_TYPE.EMAIL_DELIVERY_UPDATED,
      envelopeId: attempt.envelopeId,
      data: {
        attemptId: attempt.id,
        recipientId: recipient.id,
        recipientEmail: attempt.recipientEmail,
        recipientName: recipient.name,
        recipientRole: recipient.role,
        status,
        occurredAt: incoming.occurredAt.toISOString(),
        failureCode: incoming.failureCode,
      },
    }),
  });
};

export const processPostmarkEvent = async (event: NormalizedPostmarkEvent) => {
  // Unique insert wins across simultaneous retries; the complete transaction is atomic.
  try {
    return await withEmailDeliveryTransaction(async (tx) => {
      const attempt = event.attemptId
        ? await tx.emailDeliveryAttempt.findUnique({ where: { id: event.attemptId } })
        : null;
      const isMatched = Boolean(
        attempt &&
          attempt.provider === 'POSTMARK' &&
          attempt.providerScope === event.providerScope &&
          attempt.messageStream === event.messageStream &&
          attempt.recipientEmail.toLowerCase() === event.recipientEmail &&
          (attempt.providerServerId === null || attempt.providerServerId === event.serverId) &&
          (attempt.providerMessageId === null || attempt.providerMessageId === event.providerMessageId),
      );

      await tx.emailDeliveryEvent.create({
        data: {
          eventKey: event.eventKey,
          attemptId: isMatched ? attempt?.id : null,
          provider: 'POSTMARK',
          providerScope: String(event.serverId),
          providerMessageId: event.providerMessageId,
          eventType: event.eventType,
          status: event.status,
          occurredAt: event.occurredAt,
          failureCode: event.failureCode,
          outcome: isMatched ? 'MATCHED' : 'UNMATCHED',
        },
      });

      if (!isMatched || !attempt) {
        return 'UNMATCHED';
      }

      // SMTP does not return Postmark's message ID. Bind it on the first authenticated event.
      await tx.emailDeliveryAttempt.update({
        where: { id: attempt.id },
        data: { providerServerId: event.serverId, providerMessageId: event.providerMessageId },
      });
      await applyEmailDeliveryStatus(tx, attempt, event);
      return 'MATCHED';
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existingEvent = await prisma.emailDeliveryEvent.findUnique({ where: { eventKey: event.eventKey } });

      if (existingEvent) {
        return 'DUPLICATE';
      }
    }

    throw error;
  }
};
