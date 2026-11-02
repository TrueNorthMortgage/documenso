import { PDF } from '@libpdf/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findEnvelope: vi.fn(),
  transaction: vi.fn(),
  createField: vi.fn(),
  createRecipient: vi.fn(),
  deleteFields: vi.fn(),
  createAudit: vi.fn(),
  getTemplate: vi.fn(),
  getFile: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({
  prisma: { envelope: { findFirst: mocks.findEnvelope }, $transaction: mocks.transaction },
}));
vi.mock('../envelope/get-envelope-by-id', () => ({
  getEnvelopeWhereInput: async () => ({ envelopeWhereInput: { id: 'envelope_1' } }),
}));
vi.mock('./get-template-by-id', () => ({ getTemplateById: mocks.getTemplate }));
vi.mock('./get-organisation-template-by-id', () => ({ getOrganisationTemplateById: vi.fn() }));
vi.mock('@documenso/lib/universal/upload/get-file.server', () => ({ getFileServerSide: mocks.getFile }));
vi.mock('@documenso/lib/utils/document-audit-logs', () => ({
  createDocumentAuditLogData: (data: unknown) => data,
}));

import { applyTemplateToEnvelopeItem } from './apply-template-to-envelope-item';

const targetItem = {
  id: 'target_item',
  documentData: { type: 'BYTES', data: 'target_pdf' },
};
const targetEnvelope = {
  id: 'envelope_1',
  type: 'DOCUMENT',
  status: 'DRAFT',
  completedAt: null,
  deletedAt: null,
  correctionStartedAt: null,
  documentMeta: null,
  recipients: [],
  fields: [{ id: 9, envelopeItemId: targetItem.id }],
  envelopeItems: [{ id: 'other_item', documentData: {} }, targetItem],
};
const sourceField = {
  id: 1,
  envelopeItemId: 'template_item',
  recipientId: 1,
  type: 'TEXT',
  page: 3,
  positionX: 10,
  positionY: 20,
  width: 30,
  height: 10,
  fieldMeta: { type: 'text', required: true },
  fieldGroupId: null,
  fieldGroup: null,
  conditionalChildRule: null,
};
const template = {
  envelopeItems: [{ id: 'template_item' }, { id: 'other_template_item' }],
  fields: [sourceField],
  recipients: [{ id: 1, role: 'SIGNER', signingOrder: 1 }],
  documentMeta: null,
};
const options = {
  userId: 1,
  teamId: 1,
  envelopeId: targetEnvelope.id,
  envelopeItemId: targetItem.id,
  templateId: 1,
  templateItemId: 'template_item',
  replaceExistingFields: true,
  requestMetadata: { source: 'app', auth: 'session', requestMetadata: {} },
} as const;

beforeEach(async () => {
  vi.resetAllMocks();
  const pdf = PDF.create();
  pdf.addPage({ width: 612, height: 792 });
  pdf.addPage({ width: 612, height: 792 });
  mocks.getFile.mockResolvedValue(await pdf.save());
  mocks.findEnvelope.mockResolvedValue(structuredClone(targetEnvelope));
  mocks.getTemplate.mockResolvedValue(structuredClone(template));
  mocks.createField.mockImplementation(async ({ data }) => ({ ...data, id: 11, secondaryId: 'field_11' }));
  mocks.createRecipient.mockImplementation(async ({ data }) => ({ ...data, id: 20 }));
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      field: { create: mocks.createField, deleteMany: mocks.deleteFields },
      recipient: { create: mocks.createRecipient },
      documentAuditLog: { create: mocks.createAudit, createMany: mocks.createAudit },
    }),
  );
});

describe('applying template fields to a shorter PDF', () => {
  it.each([
    'DRAFT',
    'PENDING',
  ])('rejects inaccessible required fields in %s before replacing fields or creating recipients', async (status) => {
    mocks.findEnvelope.mockResolvedValue({
      ...structuredClone(targetEnvelope),
      status,
      correctionStartedAt: status === 'PENDING' ? new Date() : null,
    });

    await expect(applyTemplateToEnvelopeItem(options)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.deleteFields).not.toHaveBeenCalled();
    expect(mocks.createField).not.toHaveBeenCalled();
    expect(mocks.createAudit).not.toHaveBeenCalled();
  });

  it('checks the selected target PDF rather than another document in the envelope', async () => {
    await expect(applyTemplateToEnvelopeItem(options)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(mocks.getFile).toHaveBeenCalledExactlyOnceWith(targetItem.documentData);
  });

  it.each([0, -1])('rejects a template field on invalid page %s', async (page) => {
    mocks.getTemplate.mockResolvedValue({ ...template, fields: [{ ...sourceField, page }] });
    await expect(applyTemplateToEnvelopeItem(options)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('allows fields through the last target page and ignores unselected template documents', async () => {
    mocks.getTemplate.mockResolvedValue({
      ...template,
      fields: [
        { ...sourceField, page: 2 },
        { ...sourceField, id: 2, envelopeItemId: 'other_template_item', page: 10 },
      ],
    });
    mocks.findEnvelope.mockResolvedValue({
      ...targetEnvelope,
      recipients: [{ id: 10, role: 'SIGNER', signingOrder: 1, sendStatus: 'NOT_SENT', signingStatus: 'NOT_SIGNED' }],
    });

    await expect(applyTemplateToEnvelopeItem(options)).resolves.toMatchObject({ fields: [{ page: 2 }] });
    expect(mocks.createField).toHaveBeenCalledExactlyOnceWith({
      data: expect.objectContaining({ page: 2, envelopeItemId: targetItem.id, recipientId: 10 }),
    });
  });

  it('does not partially apply a template with both valid and missing-page fields', async () => {
    mocks.getTemplate.mockResolvedValue({
      ...template,
      fields: [{ ...sourceField, id: 2, page: 1 }, sourceField],
    });
    await expect(applyTemplateToEnvelopeItem(options)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('preserves the document when its PDF cannot be read', async () => {
    mocks.getFile.mockRejectedValue(new Error('PDF unavailable'));
    await expect(applyTemplateToEnvelopeItem(options)).rejects.toThrow('PDF unavailable');
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('applies only remaining fields after the exact omissions are confirmed', async () => {
    mocks.getTemplate.mockResolvedValue({
      ...template,
      fields: [sourceField, { ...sourceField, id: 2, page: 2, recipientId: 2 }],
      recipients: [...template.recipients, { id: 2, role: 'SIGNER', signingOrder: 2 }],
    });

    await expect(applyTemplateToEnvelopeItem({ ...options, excludedFieldIds: [1] })).resolves.toMatchObject({
      fields: [{ page: 2 }],
    });
    expect(mocks.createField).toHaveBeenCalledExactlyOnceWith({ data: expect.objectContaining({ page: 2 }) });
    expect(mocks.createRecipient).toHaveBeenCalledExactlyOnceWith({
      data: expect.objectContaining({ signingOrder: 2 }),
    });
  });

  it('rejects stale or arbitrary omission confirmations', async () => {
    mocks.getTemplate.mockResolvedValue({ ...template, fields: [sourceField, { ...sourceField, id: 2, page: 1 }] });
    await expect(applyTemplateToEnvelopeItem({ ...options, excludedFieldIds: [2] })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('requires confirmation for conditional descendants on existing pages too', async () => {
    mocks.getTemplate.mockResolvedValue({
      ...template,
      fields: [
        sourceField,
        { ...sourceField, id: 2, page: 1, conditionalChildRule: { parentFieldId: 1 } },
        { ...sourceField, id: 3, page: 2 },
      ],
    });
    await expect(applyTemplateToEnvelopeItem({ ...options, excludedFieldIds: [1] })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
    await expect(applyTemplateToEnvelopeItem({ ...options, excludedFieldIds: [1, 2] })).resolves.toMatchObject({
      fields: [{ page: 2 }],
    });
    expect(mocks.createField).toHaveBeenCalledOnce();
  });

  it('does not clear existing fields if every template field would be omitted', async () => {
    await expect(applyTemplateToEnvelopeItem({ ...options, excludedFieldIds: [1] })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
