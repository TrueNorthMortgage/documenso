import { DocumentStatus, RecipientRole, SigningStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: { findFirstOrThrow: vi.fn() },
  envelope: { findUnique: vi.fn(), update: vi.fn() },
  recipient: { updateMany: vi.fn() },
  documentAuditLog: { create: vi.fn() },
  transaction: vi.fn(),
  sendEmail: vi.fn(),
  triggerJob: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({ prisma: { ...mocks, $transaction: mocks.transaction } }));
vi.mock('@lingui/core/macro', () => ({ msg: (message: unknown) => message }));
vi.mock('@documenso/email/templates/document-invite', () => ({ DocumentInviteEmailTemplate: () => null }));
vi.mock('../../jobs/client', () => ({ jobs: { triggerJob: mocks.triggerJob } }));
vi.mock('../../client-only/providers/i18n-server', () => ({ getI18nInstance: vi.fn() }));
vi.mock('../../utils/render-email-with-i18n', () => ({ renderEmailWithI18N: vi.fn() }));
vi.mock('../email/get-email-context', () => ({ getEmailContext: vi.fn() }));
vi.mock('../email/send-tracked-signing-email', () => ({ sendTrackedSigningEmail: mocks.sendEmail }));
vi.mock('../envelope/get-envelope-by-id', () => ({
  getEnvelopeWhereInput: () => ({ envelopeWhereInput: { id: 'envelope-1' } }),
}));
vi.mock('../field/auto-insert-conditional-field-defaults', () => ({ autoInsertConditionalFieldDefaults: vi.fn() }));
vi.mock('../webhooks/trigger/trigger-webhook', () => ({ triggerWebhook: vi.fn() }));
vi.mock('../../types/webhook-payload', () => ({
  mapEnvelopeToWebhookDocumentPayload: (value: unknown) => value,
  ZWebhookDocumentSchema: { parse: (value: unknown) => value },
}));

import { type ResendDocumentOptions, resendDocument } from './resend-document';

const optedOutRecipient = {
  id: 1,
  email: 'opted-out@example.com',
  name: 'Opted out',
  role: RecipientRole.VIEWER,
  signingStatus: SigningStatus.NOT_SIGNED,
  notificationsOptedOutAt: new Date(),
};

const options: ResendDocumentOptions = {
  id: { type: 'envelopeId', id: 'envelope-1' },
  userId: 1,
  teamId: 1,
  recipients: [1, 2],
  requestMetadata: { source: 'app', auth: 'session', requestMetadata: {} },
};

describe('manual reminder recipient selection', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.user.findFirstOrThrow.mockResolvedValue({ id: 1, email: 'sender@example.com', name: 'Sender' });
    mocks.envelope.findUnique.mockResolvedValue({
      id: 'envelope-1',
      status: DocumentStatus.PENDING,
      correctionStartedAt: null,
      recipients: [
        optedOutRecipient,
        { ...optedOutRecipient, id: 2, email: 'subscribed@example.com', notificationsOptedOutAt: null },
      ],
      fields: [],
      team: { name: 'Team' },
      documentMeta: { emailSettings: { recipientSigningRequest: false } },
    });
    mocks.transaction.mockImplementation(async (callback) => callback(mocks));
  });

  it('excludes opted-out recipients from manual reminders and deadline extensions', async () => {
    await resendDocument(options);

    expect(mocks.recipient.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [2] } },
      data: { expiresAt: expect.any(Date), expirationNotifiedAt: null },
    });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it('rejects a manual reminder targeting only opted-out recipients', async () => {
    await expect(resendDocument({ ...options, recipients: [1] })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(mocks.recipient.updateMany).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.triggerJob).not.toHaveBeenCalled();
  });

  it('preserves correction processing for opted-out recipients', async () => {
    const envelope = await mocks.envelope.findUnique();
    mocks.envelope.findUnique.mockResolvedValue({ ...envelope, correctionStartedAt: new Date() });

    await resendDocument({ ...options, recipients: [1] });

    expect(mocks.recipient.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: [1] } } }));
    expect(mocks.envelope.update).toHaveBeenCalledWith({
      where: { id: 'envelope-1' },
      data: { correctionStartedAt: null },
    });
  });
});
