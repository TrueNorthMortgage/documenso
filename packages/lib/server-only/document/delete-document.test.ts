import { DocumentStatus, SendStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  envelope: vi.fn(),
  audit: vi.fn(),
  hardDelete: vi.fn(),
  softDelete: vi.fn(),
  hide: vi.fn(),
  roles: vi.fn(),
  sendMail: vi.fn(),
  render: vi.fn(),
  emailSettings: vi.fn(),
  webhook: vi.fn(),
}));
vi.mock('@lingui/core/macro', () => ({ msg: (message: unknown) => message }));
vi.mock('@documenso/prisma', () => ({
  prisma: {
    user: { findUnique: mocks.user },
    envelope: { findUnique: mocks.envelope },
    recipient: { update: mocks.hide },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        documentAuditLog: { create: mocks.audit },
        envelope: { delete: mocks.hardDelete, update: mocks.softDelete },
      }),
  },
}));
vi.mock('@documenso/email/mailer', () => ({ mailer: { sendMail: mocks.sendMail } }));
vi.mock('@documenso/email/templates/document-cancel', () => ({ default: () => null }));
vi.mock('../../client-only/providers/i18n-server', () => ({
  getI18nInstance: async () => ({ _: () => 'Document Cancelled' }),
}));
vi.mock('../../types/document-email', () => ({ extractDerivedDocumentEmailSettings: mocks.emailSettings }));
vi.mock('../../types/webhook-payload', () => ({
  mapEnvelopeToWebhookDocumentPayload: () => ({}),
  ZWebhookDocumentSchema: { parse: (value: unknown) => value },
}));
vi.mock('../../utils/render-email-with-i18n', () => ({ renderEmailWithI18N: mocks.render }));
vi.mock('../team/get-member-roles', () => ({ getMemberRoles: mocks.roles }));
vi.mock('../webhooks/trigger/trigger-webhook', () => ({ triggerWebhook: mocks.webhook }));
vi.mock('../email/get-email-context', () => ({
  getEmailContext: async () => ({
    branding: {},
    emailLanguage: 'en',
    senderEmail: 'sender@example.com',
    replyToEmail: 'sender@example.com',
  }),
}));

import { deleteDocument } from './delete-document';

const options = {
  id: { type: 'envelopeId' as const, id: 'envelope_fixture' },
  userId: 1,
  teamId: 2,
  requestMetadata: { source: 'app' as const, auth: 'session' as const, requestMetadata: {} },
};
const envelope = {
  id: 'envelope_fixture',
  title: 'Signing package',
  teamId: 2,
  userId: 1,
  status: DocumentStatus.PENDING,
  deletedAt: null,
  documentMeta: null,
  recipients: [{ id: 3, email: 'recipient@example.com', name: 'Recipient', sendStatus: SendStatus.SENT }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: 1, name: 'Sender', email: 'sender@example.com' });
  mocks.envelope.mockResolvedValue(envelope);
  mocks.roles.mockResolvedValue({});
  mocks.hardDelete.mockResolvedValue(envelope);
  mocks.softDelete.mockResolvedValue(envelope);
  mocks.emailSettings.mockReturnValue({ documentDeleted: true });
  mocks.render.mockResolvedValue('rendered cancellation email');
  mocks.sendMail.mockResolvedValue({});
});

describe('cancellation message', () => {
  it('stores the trimmed message in the audit event and includes it in both email formats', async () => {
    await deleteDocument({ ...options, cancellationReason: '  Please use the updated package.  ' });
    expect(mocks.audit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'DOCUMENT_DELETED',
        data: { type: 'HARD', cancellationReason: 'Please use the updated package.' },
      }),
    });
    expect(mocks.hardDelete).toHaveBeenCalledOnce();
    expect(mocks.render).toHaveBeenCalledTimes(2);
    for (const [template] of mocks.render.mock.calls) {
      expect(template.props.cancellationReason).toBe('Please use the updated package.');
    }
    expect(mocks.sendMail).toHaveBeenCalledOnce();
  });

  it.each([undefined, '', '   '])('preserves cancellation without a message: %s', async (cancellationReason) => {
    await deleteDocument({ ...options, cancellationReason });
    expect(mocks.audit.mock.calls[0][0].data.data).toEqual({ type: 'HARD' });
    expect(mocks.render.mock.calls[0][0].props.cancellationReason).toBeUndefined();
    expect(mocks.sendMail).toHaveBeenCalledOnce();
  });

  it('records the message even when cancellation emails are disabled', async () => {
    mocks.emailSettings.mockReturnValue({ documentDeleted: false });
    await deleteDocument({ ...options, cancellationReason: 'Updated terms' });
    expect(mocks.audit.mock.calls[0][0].data.data.cancellationReason).toBe('Updated terms');
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it.each([
    DocumentStatus.DRAFT,
    DocumentStatus.COMPLETED,
    DocumentStatus.REJECTED,
  ])('ignores messages outside active cancellation: %s', async (status) => {
    mocks.envelope.mockResolvedValue({ ...envelope, status });
    await deleteDocument({ ...options, cancellationReason: 'Not a cancellation' });
    expect(mocks.audit.mock.calls[0][0].data.data).not.toHaveProperty('cancellationReason');
    if (mocks.render.mock.calls.length) {
      expect(mocks.render.mock.calls[0][0].props.cancellationReason).toBeUndefined();
    }
  });

  it('does not send or record a cancellation message when a recipient only hides the document', async () => {
    mocks.user.mockResolvedValue({ id: 3, email: 'recipient@example.com' });
    mocks.roles.mockRejectedValue(new Error('not a team member'));
    mocks.envelope.mockResolvedValue({
      ...envelope,
      recipients: [{ ...envelope.recipients[0], documentDeletedAt: null }],
    });
    mocks.hide.mockResolvedValue({});
    await deleteDocument({ ...options, userId: 3, cancellationReason: 'Recipient text' });
    expect(mocks.hide).toHaveBeenCalledOnce();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });
});
