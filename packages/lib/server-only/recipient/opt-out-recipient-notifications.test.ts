import { DocumentStatus, EnvelopeType, RecipientRole, SigningStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    recipient: { findFirst: vi.fn(), updateMany: vi.fn() },
    documentAuditLog: { create: vi.fn() },
  };

  return { ...tx.recipient, tx };
});

vi.mock('@documenso/prisma', () => ({
  prisma: { $transaction: (callback: (tx: typeof mocks.tx) => unknown) => callback(mocks.tx) },
}));

import { optOutRecipientNotifications } from './opt-out-recipient-notifications';

describe('optOutRecipientNotifications', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findFirst.mockResolvedValue({
      id: 1,
      envelopeId: 'envelope-1',
      name: 'Recipient',
      email: 'recipient@example.com',
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it('only opts out the token owner in its envelope and clears scheduled reminders', async () => {
    await optOutRecipientNotifications({ token: 'recipient-token' });

    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: {
        token: 'recipient-token',
        signingStatus: SigningStatus.NOT_SIGNED,
        role: { not: RecipientRole.CC },
        envelope: { deletedAt: null, type: EnvelopeType.DOCUMENT, status: DocumentStatus.PENDING },
      },
      select: { id: true, envelopeId: true, name: true, email: true },
    });
    expect(mocks.tx.documentAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'RECIPIENT_NOTIFICATIONS_OPTED_OUT',
        envelopeId: 'envelope-1',
        email: 'recipient@example.com',
        name: 'Recipient',
        data: {
          recipientId: 1,
          recipientName: 'Recipient',
          recipientEmail: 'recipient@example.com',
          optedOutAt: expect.any(String),
        },
      }),
    });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: 1,
        envelopeId: 'envelope-1',
        token: 'recipient-token',
        signingStatus: SigningStatus.NOT_SIGNED,
        role: { not: RecipientRole.CC },
        notificationsOptedOutAt: null,
        envelope: { deletedAt: null, type: EnvelopeType.DOCUMENT, status: DocumentStatus.PENDING },
      },
      data: { notificationsOptedOutAt: expect.any(Date), nextReminderAt: null },
    });
  });

  it('rejects invalid or deleted-envelope links without changing a preference', async () => {
    mocks.findFirst.mockResolvedValue(null);

    await expect(optOutRecipientNotifications({ token: 'invalid' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.documentAuditLog.create).not.toHaveBeenCalled();
  });

  it('allows repeated confirmation without overwriting the original opt-out timestamp', async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(optOutRecipientNotifications({ token: 'recipient-token' })).resolves.toBeUndefined();
    expect(mocks.updateMany.mock.calls[0][0].where.notificationsOptedOutAt).toBeNull();
    expect(mocks.tx.documentAuditLog.create).not.toHaveBeenCalled();
  });

  it('does not write an opt-out or audit entry if the envelope completes after the lookup', async () => {
    mocks.updateMany.mockImplementation(async ({ where }) => ({
      count: where.envelope.status === DocumentStatus.PENDING ? 0 : 1,
    }));

    await optOutRecipientNotifications({ token: 'recipient-token' });

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          envelope: { deletedAt: null, type: EnvelopeType.DOCUMENT, status: DocumentStatus.PENDING },
        }),
      }),
    );
    expect(mocks.tx.documentAuditLog.create).not.toHaveBeenCalled();
  });

  it('records request metadata with the opt-out', async () => {
    await optOutRecipientNotifications({
      token: 'recipient-token',
      requestMetadata: { ipAddress: '127.0.0.1', userAgent: 'test-browser' },
    });

    expect(mocks.tx.documentAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ ipAddress: '127.0.0.1', userAgent: 'test-browser' }),
    });
  });

  it('fails the transaction if the audit entry cannot be saved', async () => {
    mocks.tx.documentAuditLog.create.mockRejectedValue(new Error('Audit write failed'));
    await expect(optOutRecipientNotifications({ token: 'recipient-token' })).rejects.toThrow('Audit write failed');
  });
});
