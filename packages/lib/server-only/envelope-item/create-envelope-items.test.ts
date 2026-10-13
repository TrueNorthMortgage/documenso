import type { Envelope, EnvelopeItem, Prisma, Recipient } from '@prisma/client';
import { FieldType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  lock: vi.fn(),
  findRecipients: vi.fn(),
  createRecipients: vi.fn(),
  createItems: vi.fn(),
  createFields: vi.fn(),
  extractPlaceholders: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock('../document-conversion', () => ({ convertToPdf: async () => Buffer.from('PDF') }));
vi.mock('../pdf/normalize-pdf', () => ({ normalizePdf: async (buffer: Buffer) => buffer }));
vi.mock('../pdf/insert-form-values-in-pdf', () => ({ insertFormValuesInPdf: vi.fn() }));
vi.mock('../../universal/upload/put-file.server', () => ({
  putPdfFileServerSide: async () => ({ documentData: { id: 'pdf_1' } }),
}));
vi.mock('../../utils/document-audit-logs', () => ({ createDocumentAuditLogData: () => ({}) }));
vi.mock('../pdf/auto-place-fields', () => ({
  extractPdfPlaceholders: mocks.extractPlaceholders,
  convertPlaceholdersToFieldInputs: (
    placeholders: { recipient: string; placeholder: string }[],
    resolve: (recipient: string, placeholder: string) => { id: number },
  ) =>
    placeholders.map((placeholder) => ({
      recipientId: resolve(placeholder.recipient, placeholder.placeholder).id,
      type: 'SIGNATURE',
      page: 1,
      positionX: 10,
      positionY: 10,
      width: 20,
      height: 5,
    })),
}));

import { UNSAFE_createEnvelopeItems } from './create-envelope-items';

const recipient = { id: 41, name: 'Existing signer', email: 'signer@example.com', signingOrder: null };
const envelope = {
  id: 'envelope_1',
  type: 'DOCUMENT',
  formValues: null,
  envelopeItems: [],
  recipients: [recipient],
} as unknown as Envelope & { envelopeItems: EnvelopeItem[]; recipients: Recipient[] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lock.mockResolvedValue([]);
  mocks.findRecipients.mockResolvedValue([recipient]);
  mocks.createRecipients.mockImplementation(async ({ data }) =>
    data.map((value: Prisma.RecipientCreateManyInput) => ({ ...value, id: 42 })),
  );
  mocks.createItems.mockImplementation(async ({ data }) => data);
  mocks.extractPlaceholders.mockResolvedValue({
    cleanedPdf: Buffer.from('PDF'),
    placeholders: [{ recipient: 'r2', placeholder: '{{r2;signature}}', fieldAndMeta: { type: FieldType.SIGNATURE } }],
  });
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      $queryRaw: mocks.lock,
      recipient: { findMany: mocks.findRecipients, createManyAndReturn: mocks.createRecipients },
      envelopeItem: { createManyAndReturn: mocks.createItems },
      field: { createMany: mocks.createFields },
      documentAuditLog: { createMany: vi.fn() },
    }),
  );
});

const upload = (options: { createMissingRecipients?: boolean; recipients?: Recipient[] } = {}) =>
  UNSAFE_createEnvelopeItems({
    files: [{ file: new File(['PDF'], 'placeholders.pdf', { type: 'application/pdf' }) }],
    envelope: { ...envelope, recipients: options.recipients ?? envelope.recipients },
    user: { id: 1, name: 'Sender', email: 'sender@example.com' },
    apiRequestMetadata: { source: 'app', auth: 'session', requestMetadata: {} },
    createMissingRecipients: options.createMissingRecipients,
  });

describe('uploading PDF placeholder fields', () => {
  it('imports r2 with one existing recipient and assigns the field to the newly created recipient', async () => {
    const result = await upload({ createMissingRecipients: true });
    expect(result.items).toHaveLength(1);
    expect(result.addedRecipients).toEqual([expect.objectContaining({ id: 42, name: 'Recipient 2', email: '' })]);
    expect(mocks.createFields).toHaveBeenCalledWith({
      data: [expect.objectContaining({ recipientId: 42, envelopeItemId: result.items[0].id })],
    });
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.createItems.mock.invocationCallOrder[0]);
  });

  it('does not add recipients or fields for a PDF without placeholders', async () => {
    mocks.extractPlaceholders.mockResolvedValue({ cleanedPdf: Buffer.from('PDF'), placeholders: [] });
    const result = await upload({ createMissingRecipients: true });
    expect(result.addedRecipients).toEqual([]);
    expect(mocks.createRecipients).not.toHaveBeenCalled();
    expect(mocks.createFields).not.toHaveBeenCalled();
  });

  it('preserves embedded callers that intentionally omit recipients and do not opt into imports', async () => {
    const result = await upload({ recipients: [] });
    expect(result.items).toHaveLength(1);
    expect(result.addedRecipients).toEqual([]);
    expect(mocks.createRecipients).not.toHaveBeenCalled();
    expect(mocks.createFields).not.toHaveBeenCalled();
  });
});
