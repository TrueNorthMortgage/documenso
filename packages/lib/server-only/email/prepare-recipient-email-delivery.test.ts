import { EmailDeliveryStatus, EmailDeliveryType } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({
  prisma: {
    recipientEmailDelivery: {
      create: mocks.create,
      update: mocks.update,
    },
  },
}));

import { trackRecipientEmailDelivery } from './prepare-recipient-email-delivery';

const options = {
  envelopeId: 'envelope-1',
  recipientId: 42,
  email: 'recipient@example.com',
  type: EmailDeliveryType.SIGNING_REQUEST,
};

describe('trackRecipientEmailDelivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PRIVATE_POSTMARK_WEBHOOK_USERNAME', 'postmark');
    vi.stubEnv('NEXT_PRIVATE_POSTMARK_WEBHOOK_PASSWORD', 'secret');
    mocks.create.mockResolvedValue({ id: 'delivery-1' });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('adds correlation metadata to a tracked email attempt', async () => {
    const sendEmail = vi.fn().mockResolvedValue({ accepted: true });

    await trackRecipientEmailDelivery({ ...options, sendEmail });

    expect(mocks.create).toHaveBeenCalledWith({ data: options });
    expect(sendEmail).toHaveBeenCalledWith({
      'X-PM-Metadata-delivery-id': 'delivery-1',
      'X-PM-Metadata-envelope-id': 'envelope-1',
      'X-PM-Metadata-recipient-id': '42',
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('records synchronous provider failures before rethrowing them', async () => {
    const error = new Error('Recipient is suppressed');

    await expect(
      trackRecipientEmailDelivery({
        ...options,
        sendEmail: vi.fn().mockRejectedValue(error),
      }),
    ).rejects.toBe(error);

    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'delivery-1' },
      data: {
        status: EmailDeliveryStatus.FAILED,
        failedAt: expect.any(Date),
        failureType: 'SEND_ERROR',
        failureReason: 'Recipient is suppressed',
      },
    });
  });

  it('sends without tracking when the Postmark webhook is not configured', async () => {
    vi.stubEnv('NEXT_PRIVATE_POSTMARK_WEBHOOK_USERNAME', '');
    vi.stubEnv('NEXT_PRIVATE_POSTMARK_WEBHOOK_PASSWORD', '');
    const sendEmail = vi.fn().mockResolvedValue({ accepted: true });

    await trackRecipientEmailDelivery({ ...options, sendEmail });

    expect(sendEmail).toHaveBeenCalledWith({});
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
