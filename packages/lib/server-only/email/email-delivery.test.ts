import { EmailDeliveryPurpose, EmailDeliveryStatus, Prisma, RecipientRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    emailDeliveryAttempt: { findUnique: vi.fn(), update: vi.fn() },
    emailDeliveryEvent: { create: vi.fn() },
    recipient: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    documentAuditLog: { create: vi.fn() },
  };
  return { tx, transaction: vi.fn(), findEvent: vi.fn() };
});

vi.mock('@documenso/prisma', () => ({
  prisma: {
    $transaction: mocks.transaction,
    emailDeliveryEvent: { findUnique: mocks.findEvent },
  },
}));
vi.mock('../../utils/document-audit-logs', () => ({ createDocumentAuditLogData: (data: unknown) => data }));

import { processPostmarkEvent } from './email-delivery';
import type { NormalizedPostmarkEvent } from './postmark-event';

const attempt = {
  id: 'attempt-1',
  operationKey: 'operation-1',
  envelopeId: 'envelope-1',
  recipientId: 1,
  recipientEmail: 'signer@example.com',
  purpose: EmailDeliveryPurpose.INVITATION,
  provider: 'POSTMARK',
  providerScope: 'scope-1',
  messageStream: 'outbound',
  providerServerId: null,
  providerMessageId: null,
  status: EmailDeliveryStatus.PENDING,
  requestedAt: new Date('2026-10-05T12:00:00Z'),
  sentAt: null,
  statusAt: new Date('2026-10-05T12:00:00Z'),
  failureCode: null,
};
const event: NormalizedPostmarkEvent = {
  eventKey: 'key-1',
  attemptId: attempt.id,
  providerScope: 'scope-1',
  serverId: 23,
  messageStream: 'outbound',
  recipientEmail: attempt.recipientEmail,
  providerMessageId: 'message-1',
  eventType: 'Bounce',
  status: EmailDeliveryStatus.BOUNCED,
  occurredAt: new Date('2026-10-05T12:01:00Z'),
  failureCode: 'HardBounce',
};

describe('durable Postmark processing', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation((callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx));
    mocks.tx.emailDeliveryAttempt.findUnique.mockResolvedValue(attempt);
    mocks.tx.recipient.findUniqueOrThrow.mockResolvedValue({ id: 1, name: 'Signer', role: RecipientRole.SIGNER });
  });

  it('inserts, binds provider identity, updates the current projection and records activity in one transaction', async () => {
    expect(await processPostmarkEvent(event)).toBe('MATCHED');
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.emailDeliveryEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ outcome: 'MATCHED' }) }),
    );
    expect(mocks.tx.recipient.updateMany).toHaveBeenCalledWith({
      where: {
        id: 1,
        latestEmailDeliveryAttemptId: attempt.id,
        email: { equals: attempt.recipientEmail, mode: 'insensitive' },
      },
      data: { emailDeliveryStatus: EmailDeliveryStatus.BOUNCED },
    });
    expect(mocks.tx.documentAuditLog.create).toHaveBeenCalledTimes(1);
  });

  it('retains old-attempt activity even when the current recipient projection no longer matches', async () => {
    mocks.tx.recipient.updateMany.mockResolvedValue({ count: 0 });
    await processPostmarkEvent(event);
    expect(mocks.tx.documentAuditLog.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    { recipientEmail: 'another@example.com' },
    { providerScope: 'another-scope' },
    { messageStream: 'another-stream' },
    { provider: 'OTHER' },
    { providerServerId: 24 },
    { providerMessageId: 'another-message' },
  ])('does not update a mismatched attempt: %j', async (changes) => {
    mocks.tx.emailDeliveryAttempt.findUnique.mockResolvedValue({ ...attempt, ...changes });
    expect(await processPostmarkEvent(event)).toBe('UNMATCHED');
    expect(mocks.tx.emailDeliveryAttempt.update).not.toHaveBeenCalled();
    expect(mocks.tx.recipient.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.documentAuditLog.create).not.toHaveBeenCalled();
  });

  it('acknowledges legacy/unrelated events without guessing recipients from their address', async () => {
    expect(await processPostmarkEvent({ ...event, attemptId: undefined })).toBe('UNMATCHED');
    expect(mocks.tx.emailDeliveryAttempt.findUnique).not.toHaveBeenCalled();
    expect(mocks.tx.recipient.updateMany).not.toHaveBeenCalled();
  });

  it('acknowledges an already persisted duplicate without repeated side effects', async () => {
    mocks.tx.emailDeliveryEvent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6' }),
    );
    mocks.findEvent.mockResolvedValue({ id: 'saved-event' });
    expect(await processPostmarkEvent(event)).toBe('DUPLICATE');
    expect(mocks.tx.recipient.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.documentAuditLog.create).not.toHaveBeenCalled();
  });

  it('propagates persistence failures so the endpoint can request a provider retry', async () => {
    mocks.tx.emailDeliveryEvent.create.mockRejectedValue(new Error('database unavailable'));
    await expect(processPostmarkEvent(event)).rejects.toThrow('database unavailable');
    expect(mocks.tx.recipient.updateMany).not.toHaveBeenCalled();
  });

  it('retries serialization conflicts', async () => {
    mocks.transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('conflict', { code: 'P2034', clientVersion: '6' }),
    );
    expect(await processPostmarkEvent(event)).toBe('MATCHED');
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
  });
});
