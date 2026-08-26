import { ReadStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const transactionClient = {
    recipient: {
      updateMany: vi.fn(),
    },
    documentAuditLog: {
      create: vi.fn(),
    },
  };

  return {
    transactionClient,
    prisma: {
      recipient: {
        findFirst: vi.fn(),
      },
      documentAuditLog: {
        create: vi.fn(),
      },
      envelope: {
        findUniqueOrThrow: vi.fn(),
      },
      $transaction: vi.fn(async (callback: (tx: typeof transactionClient) => unknown) => callback(transactionClient)),
    },
    triggerJob: vi.fn(),
    triggerWebhook: vi.fn(),
  };
});

vi.mock('@documenso/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('../../jobs/client', () => ({ jobs: { triggerJob: mocks.triggerJob } }));
vi.mock('../webhooks/trigger/trigger-webhook', () => ({ triggerWebhook: mocks.triggerWebhook }));
vi.mock('../../types/webhook-payload', () => ({
  mapEnvelopeToWebhookDocumentPayload: (envelope: unknown) => envelope,
  ZWebhookDocumentSchema: { parse: (payload: unknown) => payload },
}));

import { viewedDocument } from './viewed-document';

const recipient = {
  id: 10,
  envelopeId: 'envelope_1',
  email: 'recipient@example.com',
  name: 'Recipient',
  role: 'SIGNER',
  readStatus: ReadStatus.NOT_OPENED,
  sentAt: new Date(),
};

describe('viewedDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.recipient.findFirst.mockResolvedValue(recipient);
    mocks.transactionClient.recipient.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.envelope.findUniqueOrThrow.mockResolvedValue({
      id: recipient.envelopeId,
      userId: 1,
      teamId: 1,
      documentMeta: {},
      recipients: [recipient],
    });
  });

  it('queues one email when the recipient opens the document for the first time', async () => {
    await viewedDocument({ token: 'recipient-token' });

    expect(mocks.transactionClient.recipient.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: recipient.id,
          readStatus: {
            not: ReadStatus.OPENED,
          },
        },
      }),
    );
    expect(mocks.triggerJob).toHaveBeenCalledOnce();
    expect(mocks.triggerJob).toHaveBeenCalledWith({
      name: 'send.recipient.opened.email',
      payload: {
        envelopeId: recipient.envelopeId,
        recipientId: recipient.id,
      },
    });
  });

  it('does not queue another email after the recipient has already opened the document', async () => {
    mocks.prisma.recipient.findFirst.mockResolvedValue({
      ...recipient,
      readStatus: ReadStatus.OPENED,
    });

    await viewedDocument({ token: 'recipient-token' });

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.triggerJob).not.toHaveBeenCalled();
  });

  it('does not queue another email when a concurrent request wins the first-open update', async () => {
    mocks.transactionClient.recipient.updateMany.mockResolvedValue({ count: 0 });

    await viewedDocument({ token: 'recipient-token' });

    expect(mocks.prisma.envelope.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(mocks.triggerJob).not.toHaveBeenCalled();
  });
});
