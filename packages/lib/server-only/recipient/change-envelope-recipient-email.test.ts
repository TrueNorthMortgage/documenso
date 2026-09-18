import { DocumentStatus, ReadStatus, RecipientRole, SendStatus, SigningStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const transactionClient = {
    envelope: {
      findFirst: vi.fn(),
    },
    recipient: {
      update: vi.fn(),
    },
    documentAuditLog: {
      create: vi.fn(),
    },
  };

  return {
    transactionClient,
    prisma: {
      $transaction: vi.fn(async (callback: (tx: typeof transactionClient) => unknown) => callback(transactionClient)),
    },
    triggerJob: vi.fn(),
  };
});

vi.mock('@documenso/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@documenso/lib/universal/id', () => ({ nanoid: () => 'rotated-signing-token' }));
vi.mock('../../jobs/client', () => ({ jobs: { triggerJob: mocks.triggerJob } }));
vi.mock('../../utils/envelope', () => ({ mapSecondaryIdToDocumentId: () => 123 }));
vi.mock('../envelope/get-envelope-by-id', () => ({
  getEnvelopeWhereInput: () => ({ envelopeWhereInput: { id: 'envelope_1' } }),
}));

import { changeEnvelopeRecipientEmail } from './change-envelope-recipient-email';

const signedRecipient = {
  id: 1,
  email: 'signed@example.com',
  name: 'Signed Recipient',
  role: RecipientRole.SIGNER,
  signingStatus: SigningStatus.SIGNED,
  readStatus: ReadStatus.OPENED,
  authOptions: { accessAuth: [], actionAuth: [] },
};

const unsignedRecipient = {
  id: 2,
  email: 'incorrect@example.com',
  name: 'Unsigned Recipient',
  role: RecipientRole.SIGNER,
  signingStatus: SigningStatus.NOT_SIGNED,
  readStatus: ReadStatus.NOT_OPENED,
  authOptions: { accessAuth: [], actionAuth: [] },
};

const envelope = {
  id: 'envelope_1',
  secondaryId: 'document_123',
  status: DocumentStatus.PENDING,
  internalVersion: 2,
  correctionStartedAt: null,
  documentMeta: { envelopeExpirationPeriod: null },
  recipients: [signedRecipient, unsignedRecipient],
};

describe('changeEnvelopeRecipientEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transactionClient.envelope.findFirst.mockResolvedValue(envelope);
    mocks.transactionClient.recipient.update.mockResolvedValue({
      ...unsignedRecipient,
      email: 'correct@example.com',
      token: 'rotated-signing-token',
      sendStatus: SendStatus.NOT_SENT,
    });
  });

  it('rotates the signing token and sends an invitation to the corrected email', async () => {
    await changeEnvelopeRecipientEmail({
      envelopeId: envelope.id,
      recipientId: unsignedRecipient.id,
      email: 'Correct@Example.com',
      userId: 1,
      teamId: 1,
      requestMetadata: {
        requestMetadata: {},
        source: 'app',
        auth: 'session',
      },
    });

    expect(mocks.transactionClient.recipient.update).toHaveBeenCalledWith({
      where: {
        id: unsignedRecipient.id,
        envelopeId: envelope.id,
      },
      data: expect.objectContaining({
        email: 'correct@example.com',
        token: 'rotated-signing-token',
        sendStatus: SendStatus.NOT_SENT,
        readStatus: ReadStatus.NOT_OPENED,
        sentAt: null,
        lastReminderSentAt: null,
        nextReminderAt: null,
        expirationNotifiedAt: null,
      }),
    });
    expect(mocks.triggerJob).toHaveBeenCalledWith({
      name: 'send.signing.requested.email',
      payload: {
        userId: 1,
        documentId: 123,
        recipientId: unsignedRecipient.id,
        requestMetadata: {},
      },
    });
  });

  it('rejects a recipient who has opened the envelope', async () => {
    mocks.transactionClient.envelope.findFirst.mockResolvedValue({
      ...envelope,
      recipients: [signedRecipient, { ...unsignedRecipient, readStatus: ReadStatus.OPENED }],
    });

    await expect(
      changeEnvelopeRecipientEmail({
        envelopeId: envelope.id,
        recipientId: unsignedRecipient.id,
        email: 'correct@example.com',
        userId: 1,
        teamId: 1,
        requestMetadata: {
          requestMetadata: {},
          source: 'app',
          auth: 'session',
        },
      }),
    ).rejects.toThrow('Recipient is not eligible for an email change');

    expect(mocks.transactionClient.recipient.update).not.toHaveBeenCalled();
    expect(mocks.triggerJob).not.toHaveBeenCalled();
  });
});
