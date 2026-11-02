import { PDF } from '@libpdf/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findEnvelope: vi.fn(),
  transaction: vi.fn(),
  updateEnvelope: vi.fn(),
  triggerJob: vi.fn(),
  triggerWebhook: vi.fn(),
  getFile: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({
  prisma: { envelope: { findFirst: mocks.findEnvelope }, $transaction: mocks.transaction },
}));
vi.mock('../envelope/get-envelope-by-id', () => ({
  getEnvelopeWhereInput: async () => ({ envelopeWhereInput: { id: 'envelope_1' } }),
}));
vi.mock('../../jobs/client', () => ({ jobs: { triggerJob: mocks.triggerJob } }));
vi.mock('../webhooks/trigger/trigger-webhook', () => ({ triggerWebhook: mocks.triggerWebhook }));
vi.mock('../../types/webhook-payload', () => ({
  mapEnvelopeToWebhookDocumentPayload: (data: unknown) => data,
  ZWebhookDocumentSchema: { parse: (data: unknown) => data },
}));
vi.mock('../../universal/upload/get-file.server', () => ({ getFileServerSide: mocks.getFile }));
vi.mock('../../universal/upload/put-file.server', () => ({ putNormalizedPdfFileServerSide: vi.fn() }));
vi.mock('../../utils/document-audit-logs', () => ({ createDocumentAuditLogData: (data: unknown) => data }));

import { sendDocument } from './send-document';

const envelope = {
  id: 'envelope_1',
  secondaryId: 'document_1',
  internalVersion: 1,
  status: 'DRAFT',
  documentMeta: null,
  recipients: [
    {
      id: 10,
      email: 'signer@example.com',
      name: 'Signer',
      role: 'SIGNER',
      sendStatus: 'NOT_SENT',
      signingStatus: 'NOT_SIGNED',
    },
  ],
  fields: [{ id: 1, envelopeItemId: 'target_item', page: 3, type: 'SIGNATURE', recipientId: 10 }],
  envelopeItems: [{ id: 'target_item', documentData: { type: 'BYTES', data: 'pdf' } }],
};
const options = {
  id: { type: 'envelopeId', id: envelope.id },
  userId: 1,
  teamId: 1,
  sendEmail: false,
  requestMetadata: { source: 'app', auth: 'session', requestMetadata: {} },
} as const;

beforeEach(async () => {
  vi.resetAllMocks();
  const pdf = PDF.create();
  pdf.addPage({ width: 612, height: 792 });
  pdf.addPage({ width: 612, height: 792 });
  mocks.getFile.mockResolvedValue(await pdf.save());
  mocks.findEnvelope.mockResolvedValue(structuredClone(envelope));
  mocks.updateEnvelope.mockResolvedValue({ ...envelope, status: 'PENDING' });
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      envelope: { update: mocks.updateEnvelope },
      documentAuditLog: { create: vi.fn() },
      recipient: { updateMany: vi.fn() },
    }),
  );
});

describe('sending documents with fields on missing pages', () => {
  it.each([0, 3])('rejects an existing field on page %s of a two-page PDF before sending', async (page) => {
    mocks.findEnvelope.mockResolvedValue({ ...envelope, fields: [{ ...envelope.fields[0], page }] });

    await expect(sendDocument(options)).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      userMessage: 'Move or remove all fields that are outside the document before sending it.',
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.triggerJob).not.toHaveBeenCalled();
    expect(mocks.triggerWebhook).not.toHaveBeenCalled();
  });

  it('sends when fields reference the last available PDF page', async () => {
    mocks.findEnvelope.mockResolvedValue({ ...envelope, fields: [{ ...envelope.fields[0], page: 2 }] });
    await expect(sendDocument(options)).resolves.toMatchObject({ status: 'PENDING' });
    expect(mocks.updateEnvelope).toHaveBeenCalledOnce();
  });
});
