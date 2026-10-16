import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findEnvelope: vi.fn(),
  updateEnvelope: vi.fn(),
  generateCertificate: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({
  prisma: {
    envelope: { findFirstOrThrow: mocks.findEnvelope, update: mocks.updateEnvelope },
    recipient: { updateMany: vi.fn() },
  },
}));
vi.mock('@documenso/signing', () => ({ signPdf: vi.fn() }));
vi.mock('@libpdf/core', () => ({ PDF: { load: vi.fn().mockResolvedValue({}) } }));
vi.mock('@documenso/lib/server-only/pdf/generate-certificate-pdf', () => ({
  generateCertificatePdf: mocks.generateCertificate,
}));
vi.mock('@documenso/lib/server-only/pdf/generate-audit-log-pdf', () => ({ generateAuditLogPdf: vi.fn() }));
vi.mock('@documenso/lib/server-only/pdf/add-rejection-stamp-to-pdf', () => ({ addRejectionStampToPdf: vi.fn() }));
vi.mock('@documenso/lib/server-only/pdf/get-page-size', () => ({
  getLastPageDimensions: () => ({ width: 612, height: 792 }),
}));
vi.mock('../../../constants/app', () => ({ NEXT_PRIVATE_USE_PLAYWRIGHT_PDF: () => false }));
vi.mock('../../../server-only/document/send-completed-email', () => ({ sendCompletedEmail: vi.fn() }));
vi.mock('../../../server-only/htmltopdf/get-audit-logs-pdf', () => ({ getAuditLogsPdf: vi.fn() }));
vi.mock('../../../server-only/htmltopdf/get-certificate-pdf', () => ({ getCertificatePdf: vi.fn() }));
vi.mock('../../../server-only/pdf/insert-field-in-pdf-v1', () => ({ insertFieldInPDFV1: vi.fn() }));
vi.mock('../../../server-only/pdf/insert-field-in-pdf-v2', () => ({ insertFieldInPDFV2: vi.fn() }));
vi.mock('../../../server-only/pdf/legacy-insert-field-in-pdf', () => ({ legacy_insertFieldInPDF: vi.fn() }));
vi.mock('../../../server-only/team/get-team-settings', () => ({
  getTeamSettings: () => ({ includeSigningCertificate: true, includeAuditLog: false }),
}));
vi.mock('../../../server-only/webhooks/trigger/trigger-webhook', () => ({ triggerWebhook: vi.fn() }));
vi.mock('../../../types/webhook-payload', () => ({
  mapEnvelopeToWebhookDocumentPayload: vi.fn(),
  ZWebhookDocumentSchema: {},
}));
vi.mock('../../../universal/upload/get-file.server', () => ({ getFileServerSide: () => new Uint8Array() }));
vi.mock('../../../universal/upload/put-file.server', () => ({ putPdfFileServerSide: vi.fn() }));
vi.mock('../../../utils/document-audit-logs', () => ({ createDocumentAuditLogData: () => ({}) }));

import { run } from './seal-document.handler';

describe('signing certificate QR token', () => {
  const stopAfterCertificate = new Error('Certificate payload captured');

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.generateCertificate.mockRejectedValue(stopAfterCertificate);
    mocks.updateEnvelope.mockResolvedValue({ qrToken: 'qr_saved_token' });
  });

  it.each([null, 'qr_existing_token'])('passes the saved token to the renderer when starting with %s', async (qrToken) => {
    mocks.findEnvelope.mockResolvedValue({
      id: 'envelope_test',
      secondaryId: 'document_test',
      title: 'Test (copy)',
      status: 'PENDING',
      qrToken,
      userId: 1,
      teamId: 1,
      internalVersion: 2,
      recipients: [{ role: 'SIGNER', signingStatus: 'SIGNED' }],
      fields: [],
      documentMeta: { language: 'en', emailSettings: null },
      user: { email: 'sender@example.invalid', name: 'Sender' },
      envelopeItems: [{ id: 'item_test', title: 'Test.pdf', field: [], documentData: {} }],
    });

    await expect(
      run({
        payload: { documentId: 'document_test', sendEmail: false },
        io: { runTask: async (_name, task) => task() } as Parameters<typeof run>[0]['io'],
      }),
    ).rejects.toBe(stopAfterCertificate);

    expect(mocks.generateCertificate).toHaveBeenCalledWith(
      expect.objectContaining({
        envelope: expect.objectContaining({ qrToken: qrToken ?? 'qr_saved_token', status: 'COMPLETED' }),
      }),
    );

    if (qrToken) {
      expect(mocks.updateEnvelope).not.toHaveBeenCalled();
    } else {
      expect(mocks.updateEnvelope).toHaveBeenCalledWith({
        where: { id: 'envelope_test' },
        data: { qrToken: expect.stringMatching(/^qr_/) },
        select: { qrToken: true },
      });
    }
  });
});
