import { EmailDeliveryPurpose, EmailDeliveryStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    emailDeliveryAttempt: { findUnique: vi.fn(), create: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    recipient: { updateMany: vi.fn() },
  };
  return { tx, sendMail: vi.fn(), applyStatus: vi.fn(), env: new Map<string, string>() };
});

vi.mock('@documenso/email/mailer', () => ({ mailer: { sendMail: mocks.sendMail } }));
vi.mock('../../utils/env', () => ({ env: (key: string) => mocks.env.get(key) }));
vi.mock('./email-delivery', () => ({
  applyEmailDeliveryStatus: mocks.applyStatus,
  withEmailDeliveryTransaction: (callback: (tx: typeof mocks.tx) => unknown) => callback(mocks.tx),
}));

import { sendTrackedSigningEmail } from './send-tracked-signing-email';

const options = {
  envelopeId: 'envelope-1',
  recipientId: 1,
  recipientEmail: 'signer@example.com',
  purpose: EmailDeliveryPurpose.INVITATION,
  operationKey: 'operation-1',
  mail: { to: 'signer@example.com', subject: 'Test', text: 'Test', headers: { 'X-Custom': 'preserved' } },
};
const attempt = {
  id: 'attempt-1',
  ...options,
  providerScope: 'scope-1',
  messageStream: 'outbound',
  status: EmailDeliveryStatus.PENDING,
  sentAt: null,
};

describe('tracked signing send', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.env.clear();
    mocks.env.set('NEXT_PRIVATE_SMTP_HOST', 'smtp.postmarkapp.com');
    mocks.env.set('NEXT_PRIVATE_SMTP_USERNAME', 'test-token');
    mocks.env.set('NEXT_PRIVATE_SMTP_PASSWORD', 'test-token');
    mocks.tx.emailDeliveryAttempt.create.mockResolvedValue(attempt);
    mocks.tx.emailDeliveryAttempt.findUniqueOrThrow.mockResolvedValue(attempt);
    mocks.tx.recipient.updateMany.mockResolvedValue({ count: 1 });
    mocks.sendMail.mockResolvedValue({ messageId: 'smtp-message-id' });
  });

  it('persists the attempt before sending and attaches metadata while preserving existing headers', async () => {
    await sendTrackedSigningEmail(options);
    expect(mocks.tx.emailDeliveryAttempt.create.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.sendMail.mock.invocationCallOrder[0],
    );
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          'X-Custom': 'preserved',
          'X-PM-Message-Stream': 'outbound',
          'X-PM-Metadata-deliveryAttemptId': 'attempt-1',
          'X-PM-Metadata-deliveryScope': 'scope-1',
        },
      }),
    );
    expect(mocks.applyStatus).toHaveBeenCalledWith(
      mocks.tx,
      attempt,
      expect.objectContaining({ status: EmailDeliveryStatus.ACCEPTED }),
    );
  });

  it('resumes the same attempt without selecting it over a newer resend', async () => {
    mocks.tx.emailDeliveryAttempt.findUnique.mockResolvedValue(attempt);
    await sendTrackedSigningEmail(options);
    expect(mocks.tx.emailDeliveryAttempt.create).not.toHaveBeenCalled();
    expect(mocks.tx.recipient.updateMany).not.toHaveBeenCalled();
  });

  it('scopes smtp-api attempts by the active credential even when smtp-auth settings remain configured', async () => {
    mocks.env.set('NEXT_PRIVATE_SMTP_TRANSPORT', 'smtp-api');
    mocks.env.set('NEXT_PRIVATE_SMTP_APIKEY', 'first-api-credential');
    await sendTrackedSigningEmail(options);

    mocks.env.set('NEXT_PRIVATE_SMTP_APIKEY', 'second-api-credential');
    await sendTrackedSigningEmail({ ...options, operationKey: 'operation-2' });

    const firstScope = mocks.tx.emailDeliveryAttempt.create.mock.calls[0][0].data.providerScope;
    const secondScope = mocks.tx.emailDeliveryAttempt.create.mock.calls[1][0].data.providerScope;
    expect(firstScope).toMatch(/^[a-f0-9]{64}$/);
    expect(secondScope).toMatch(/^[a-f0-9]{64}$/);
    expect(firstScope).not.toBe(secondScope);
  });

  it('does not resend an already accepted attempt when the enclosing job resumes', async () => {
    mocks.tx.emailDeliveryAttempt.findUnique.mockResolvedValue({ ...attempt, sentAt: new Date() });
    await sendTrackedSigningEmail(options);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('records a safe send failure and preserves the existing job error', async () => {
    mocks.sendMail.mockRejectedValue(new Error('private SMTP response'));
    await expect(sendTrackedSigningEmail(options)).rejects.toThrow('private SMTP response');
    expect(mocks.applyStatus).toHaveBeenCalledWith(
      mocks.tx,
      attempt,
      expect.objectContaining({
        status: EmailDeliveryStatus.SEND_FAILED,
        failureCode: 'SMTP_SEND_FAILED',
      }),
    );
  });

  it('does not send if the recipient changed before the attempt could be selected', async () => {
    mocks.tx.recipient.updateMany.mockResolvedValue({ count: 0 });
    await expect(sendTrackedSigningEmail(options)).rejects.toThrow('Recipient changed');
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it.each([
    'smtp.example.com',
    'smtp.postmarkapp.com.attacker.example',
  ])('keeps non-Postmark transport unchanged: %s', async (host) => {
    mocks.env.set('NEXT_PRIVATE_SMTP_HOST', host);
    await sendTrackedSigningEmail(options);
    expect(mocks.sendMail).toHaveBeenCalledWith(options.mail);
    expect(mocks.tx.emailDeliveryAttempt.create).not.toHaveBeenCalled();
  });

  it('keeps tracking inactive if the SMTP password is not configured', async () => {
    mocks.env.delete('NEXT_PRIVATE_SMTP_PASSWORD');
    await sendTrackedSigningEmail(options);
    expect(mocks.sendMail).toHaveBeenCalledWith(options.mail);
    expect(mocks.tx.emailDeliveryAttempt.create).not.toHaveBeenCalled();
  });
});
