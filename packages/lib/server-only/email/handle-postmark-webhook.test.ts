import { EmailDeliveryStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({
  prisma: {
    recipientEmailDelivery: {
      updateMany: mocks.updateMany,
    },
  },
}));

import { handlePostmarkWebhook } from './handle-postmark-webhook';

const webhookUrl = 'https://documenso.test/api/postmark/webhook';

const createRequest = (body: unknown, username = 'postmark', password = 'secret') =>
  new Request(webhookUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

const bouncePayload = {
  RecordType: 'Bounce',
  MessageID: 'message-1',
  Type: 'HardBounce',
  Description: 'The server was unable to deliver the message.',
  Details: 'smtp; 550 mailbox not found',
  Email: 'recipient@example.com',
  BouncedAt: '2026-09-16T18:00:00.000Z',
  Metadata: {
    'delivery-id': 'delivery-1',
    'envelope-id': 'envelope-1',
    'recipient-id': '42',
  },
};

describe('handlePostmarkWebhook', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PRIVATE_POSTMARK_WEBHOOK_USERNAME', 'postmark');
    vi.stubEnv('NEXT_PRIVATE_POSTMARK_WEBHOOK_PASSWORD', 'secret');
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('rejects requests with invalid basic authentication', async () => {
    const response = await handlePostmarkWebhook(createRequest(bouncePayload, 'postmark', 'wrong'));

    expect(response.status).toBe(401);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('records a Postmark bounce against the exact delivery attempt', async () => {
    const response = await handlePostmarkWebhook(createRequest(bouncePayload));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ processed: true });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'delivery-1',
        envelopeId: 'envelope-1',
        recipientId: 42,
        email: {
          equals: 'recipient@example.com',
          mode: 'insensitive',
        },
        OR: [{ providerMessageId: null }, { providerMessageId: 'message-1' }],
        complainedAt: null,
        AND: [{ OR: [{ deliveredAt: null }, { deliveredAt: { lte: new Date('2026-09-16T18:00:00.000Z') } }] }],
      },
      data: {
        status: EmailDeliveryStatus.FAILED,
        providerMessageId: 'message-1',
        failedAt: new Date('2026-09-16T18:00:00.000Z'),
        failureType: 'HardBounce',
        failureReason: 'smtp; 550 mailbox not found',
      },
    });
  });

  it('records successful delivery without changing Documenso opened state', async () => {
    const response = await handlePostmarkWebhook(
      createRequest({
        RecordType: 'Delivery',
        MessageID: 'message-1',
        Recipient: 'recipient@example.com',
        DeliveredAt: '2026-09-16T18:00:00.000Z',
        Metadata: bouncePayload.Metadata,
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          status: EmailDeliveryStatus.DELIVERED,
          providerMessageId: 'message-1',
          deliveredAt: new Date('2026-09-16T18:00:00.000Z'),
        },
      }),
    );
  });

  it('records spam complaints as a separate terminal state', async () => {
    const response = await handlePostmarkWebhook(
      createRequest({
        ...bouncePayload,
        RecordType: 'SpamComplaint',
        Type: 'SpamComplaint',
        Description: 'The subscriber explicitly marked this message as spam.',
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: EmailDeliveryStatus.COMPLAINED,
          complainedAt: new Date('2026-09-16T18:00:00.000Z'),
        }),
      }),
    );
  });

  it('acknowledges unrelated email bounces without updating a recipient', async () => {
    const response = await handlePostmarkWebhook(
      createRequest({
        ...bouncePayload,
        Metadata: {},
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ processed: false });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it('ignores Postmark engagement events because Documenso tracks envelope opens', async () => {
    const response = await handlePostmarkWebhook(
      createRequest({
        RecordType: 'Open',
        MessageID: 'message-1',
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ processed: false });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
