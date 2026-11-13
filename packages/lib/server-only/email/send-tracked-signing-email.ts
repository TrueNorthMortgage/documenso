import { randomUUID } from 'node:crypto';

import { mailer } from '@documenso/email/mailer';
import { prisma } from '@documenso/prisma';
import { EmailDeliveryPurpose, EmailDeliveryStatus } from '@prisma/client';
import type { SendMailOptions, SentMessageInfo } from 'nodemailer';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { applyEmailDeliveryStatus, withEmailDeliveryTransaction } from './email-delivery';
import { getPostmarkDeliveryHeaders, getPostmarkDeliveryScope } from './postmark-config';

type TrackedSigningEmailOptions = {
  envelopeId: string;
  recipientId: number;
  recipientEmail: string;
  purpose: EmailDeliveryPurpose;
  operationKey?: string;
  mail: SendMailOptions;
};

export const sendTrackedSigningEmail = async ({
  envelopeId,
  recipientId,
  recipientEmail,
  purpose,
  operationKey = randomUUID(),
  mail,
}: TrackedSigningEmailOptions) => {
  // Recheck at delivery time, including retries of jobs queued before the opt-out.
  if (purpose === EmailDeliveryPurpose.REMINDER || purpose === EmailDeliveryPurpose.RESEND) {
    const recipient = await prisma.recipient.findFirst({
      where: { id: recipientId, envelopeId, notificationsOptedOutAt: null },
      select: { id: true },
    });

    if (!recipient) {
      return false;
    }
  }

  const providerScope = getPostmarkDeliveryScope();

  if (!providerScope) {
    return mailer.sendMail(mail);
  }

  const recipientAddress = recipientEmail.toLowerCase();
  const attempt = await withEmailDeliveryTransaction(async (tx) => {
    const existingAttempt = await tx.emailDeliveryAttempt.findUnique({ where: { operationKey } });

    if (existingAttempt) {
      if (
        existingAttempt.envelopeId !== envelopeId ||
        existingAttempt.recipientId !== recipientId ||
        existingAttempt.recipientEmail !== recipientAddress
      ) {
        throw new AppError(AppErrorCode.INVALID_REQUEST, { message: 'Email operation does not match recipient' });
      }

      return existingAttempt;
    }

    const createdAttempt = await tx.emailDeliveryAttempt.create({
      data: {
        operationKey,
        envelopeId,
        recipientId,
        recipientEmail: recipientAddress,
        purpose,
        provider: 'POSTMARK',
        providerScope,
        messageStream: 'outbound',
      },
    });
    const selected = await tx.recipient.updateMany({
      where: { id: recipientId, envelopeId, email: { equals: recipientAddress, mode: 'insensitive' } },
      data: {
        latestEmailDeliveryAttemptId: createdAttempt.id,
        emailDeliveryStatus: EmailDeliveryStatus.PENDING,
        emailDeliveryEmail: recipientAddress,
      },
    });

    if (selected.count !== 1) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, { message: 'Recipient changed before email was sent' });
    }

    return createdAttempt;
  });

  // An accepted attempt can be resumed without issuing another SMTP request.
  if (
    attempt.sentAt ||
    ![EmailDeliveryStatus.PENDING, EmailDeliveryStatus.ACCEPTED, EmailDeliveryStatus.SEND_FAILED].some(
      (status) => status === attempt.status,
    )
  ) {
    return;
  }

  let result: SentMessageInfo;

  try {
    result = await mailer.sendMail({
      ...mail,
      headers: {
        ...mail.headers,
        ...getPostmarkDeliveryHeaders(attempt),
      },
    });
  } catch (error) {
    // Store a safe classification, never Nodemailer's raw response or message body.
    await withEmailDeliveryTransaction(async (tx) => {
      const currentAttempt = await tx.emailDeliveryAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
      await applyEmailDeliveryStatus(tx, currentAttempt, {
        status: EmailDeliveryStatus.SEND_FAILED,
        occurredAt: new Date(),
        failureCode: 'SMTP_SEND_FAILED',
      });
    });
    throw error;
  }

  await withEmailDeliveryTransaction(async (tx) => {
    const currentAttempt = await tx.emailDeliveryAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    const sentAt = new Date();
    await tx.emailDeliveryAttempt.update({ where: { id: attempt.id }, data: { sentAt } });
    await applyEmailDeliveryStatus(tx, currentAttempt, {
      status: EmailDeliveryStatus.ACCEPTED,
      occurredAt: sentAt,
      failureCode: null,
    });
  });

  return result;
};
