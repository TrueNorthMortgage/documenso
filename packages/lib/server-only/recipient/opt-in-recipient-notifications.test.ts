import {
  DocumentDistributionMethod,
  DocumentStatus,
  EnvelopeType,
  RecipientRole,
  SendStatus,
  SigningStatus,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  tx: {
    recipient: { findFirst: vi.fn(), updateMany: vi.fn() },
    documentAuditLog: { create: vi.fn() },
  },
}));

vi.mock('@documenso/prisma', () => ({
  prisma: { $transaction: (callback: (tx: typeof mocks.tx) => unknown) => callback(mocks.tx) },
}));

import { ZDocumentAuditLogSchema } from '../../types/document-audit-logs';
import { optInRecipientNotifications } from './opt-in-recipient-notifications';

const optedOutAt = new Date('2026-10-26T12:00:00Z');
const options = { token: 'recipient-token', optedOutAt, requestMetadata: { ipAddress: '127.0.0.1' } };

describe('optInRecipientNotifications', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.tx.recipient.findFirst.mockResolvedValue({
      id: 1,
      envelopeId: 'envelope-1',
      name: 'Recipient',
      email: 'recipient@example.com',
      notificationsOptedOutAt: optedOutAt,
      sendStatus: SendStatus.SENT,
      sentAt: new Date(),
      expiresAt: null,
      lastReminderSentAt: null,
      envelope: {
        documentMeta: {
          distributionMethod: DocumentDistributionMethod.EMAIL,
          reminderSettings: { sendAfter: { unit: 'day', amount: 5 }, repeatEvery: { unit: 'day', amount: 2 } },
        },
      },
    });
    mocks.tx.recipient.updateMany.mockResolvedValue({ count: 1 });
  });

  it('only resumes reminders for the token owner and restores the configured schedule', async () => {
    await optInRecipientNotifications(options);

    expect(mocks.tx.recipient.updateMany).toHaveBeenCalledWith({
      where: {
        token: 'recipient-token',
        id: 1,
        envelopeId: 'envelope-1',
        notificationsOptedOutAt: optedOutAt,
        signingStatus: SigningStatus.NOT_SIGNED,
        role: { not: RecipientRole.CC },
        envelope: { deletedAt: null, type: EnvelopeType.DOCUMENT, status: DocumentStatus.PENDING },
      },
      data: { notificationsOptedOutAt: null, nextReminderAt: expect.any(Date) },
    });

    const entry = mocks.tx.documentAuditLog.create.mock.calls[0][0].data;
    expect(entry).toMatchObject({
      type: 'RECIPIENT_NOTIFICATIONS_RESUMED',
      envelopeId: 'envelope-1',
      email: 'recipient@example.com',
      name: 'Recipient',
      userId: null,
      ipAddress: '127.0.0.1',
      data: { recipientId: 1, resumedByRecipient: true },
    });
    expect(ZDocumentAuditLogSchema.safeParse({ ...entry, id: 'resume-log', createdAt: new Date() }).success).toBe(true);
  });

  it('rejects invalid tokens, inactive envelopes, and completed recipients', async () => {
    mocks.tx.recipient.findFirst.mockResolvedValue(null);

    await expect(optInRecipientNotifications(options)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mocks.tx.recipient.findFirst).toHaveBeenCalledWith({
      where: {
        token: 'recipient-token',
        signingStatus: SigningStatus.NOT_SIGNED,
        role: { not: RecipientRole.CC },
        envelope: { deletedAt: null, type: EnvelopeType.DOCUMENT, status: DocumentStatus.PENDING },
      },
      include: { envelope: { select: { documentMeta: true } } },
    });
    expect(mocks.tx.recipient.updateMany).not.toHaveBeenCalled();
  });

  it('does not let an old confirmation form clear a newer opt-out', async () => {
    await expect(optInRecipientNotifications({ ...options, optedOutAt: new Date(0) })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    expect(mocks.tx.recipient.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.documentAuditLog.create).not.toHaveBeenCalled();
  });

  it('does not create duplicate audit entries for repeated opt-ins', async () => {
    const recipient = await mocks.tx.recipient.findFirst();
    mocks.tx.recipient.findFirst.mockResolvedValue({ ...recipient, notificationsOptedOutAt: null });

    await optInRecipientNotifications(options);

    expect(mocks.tx.recipient.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.documentAuditLog.create).not.toHaveBeenCalled();
  });

  it('rejects a concurrent preference change without recording an opt-in', async () => {
    mocks.tx.recipient.updateMany.mockResolvedValue({ count: 0 });

    await expect(optInRecipientNotifications(options)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(mocks.tx.documentAuditLog.create).not.toHaveBeenCalled();
  });

  it('keeps automatic reminders disabled when the envelope settings disable them', async () => {
    const recipient = await mocks.tx.recipient.findFirst();
    recipient.envelope.documentMeta.reminderSettings = null;
    mocks.tx.recipient.findFirst.mockResolvedValue(recipient);

    await optInRecipientNotifications(options);

    expect(mocks.tx.recipient.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { notificationsOptedOutAt: null, nextReminderAt: null },
      }),
    );
  });

  it('fails the transaction if its audit entry cannot be saved', async () => {
    mocks.tx.documentAuditLog.create.mockRejectedValue(new Error('Audit write failed'));
    await expect(optInRecipientNotifications(options)).rejects.toThrow('Audit write failed');
  });
});
