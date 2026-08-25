import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    envelope: {
      findFirst: vi.fn(),
    },
    envelopeItem: {
      findFirst: vi.fn(),
    },
    documentData: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  getEnvelopeWhereInput: vi.fn(),
  getAccessibleTemplate: vi.fn(),
  resolveTemplateRecipient: vi.fn(),
  getFileServerSide: vi.fn(),
  putNormalizedPdfFileServerSide: vi.fn(),
  getEnvelopeItemPermissions: vi.fn(),
  canRecipientFieldsBeModified: vi.fn(),
  createDocumentAuditLogData: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('../envelope/get-envelope-by-id', () => ({
  getEnvelopeWhereInput: mocks.getEnvelopeWhereInput,
}));
vi.mock('./apply-template-to-envelope-item', () => ({
  getAccessibleTemplate: mocks.getAccessibleTemplate,
  resolveTemplateRecipient: mocks.resolveTemplateRecipient,
}));
vi.mock('../../utils/recipients', () => ({
  canRecipientFieldsBeModified: mocks.canRecipientFieldsBeModified,
}));
vi.mock('@documenso/lib/utils/envelope', () => ({
  getEnvelopeItemPermissions: mocks.getEnvelopeItemPermissions,
}));
vi.mock('@documenso/lib/universal/upload/get-file.server', () => ({
  getFileServerSide: mocks.getFileServerSide,
}));
vi.mock('@documenso/lib/universal/upload/put-file.server', () => ({
  putNormalizedPdfFileServerSide: mocks.putNormalizedPdfFileServerSide,
}));
vi.mock('@documenso/lib/utils/document-audit-logs', () => ({
  createDocumentAuditLogData: mocks.createDocumentAuditLogData,
}));

import { addTemplateToEnvelope } from './add-template-to-envelope';

const targetEnvelope = {
  id: 'envelope_1',
  type: 'DOCUMENT',
  status: 'DRAFT',
  completedAt: null,
  deletedAt: null,
  recipients: [{ id: 10, role: 'SIGNER', signingOrder: 1 }],
  fields: [],
  envelopeItems: [],
  team: {
    organisation: {
      organisationClaim: {
        envelopeItemCount: 10,
      },
    },
  },
};

const sourceField = {
  id: 1,
  envelopeItemId: 'template_item_1',
  recipientId: 1,
  type: 'TEXT',
  page: 1,
  positionX: 10,
  positionY: 20,
  width: 100,
  height: 20,
  fieldMeta: null,
  fieldGroupId: 'group_1',
  fieldGroup: {
    id: 'group_1',
    name: 'Required fields',
    type: 'TEXT',
    required: true,
    readOnly: false,
    fontSize: null,
    direction: null,
    validationRule: null,
    validationLength: null,
    recipientId: 1,
    envelopeItemId: 'template_item_1',
  },
  conditionalChildRule: null,
};

const sourceChildField = {
  ...sourceField,
  id: 2,
  conditionalChildRule: {
    parentFieldId: 1,
    operator: 'EQUALS',
    value: 'show',
  },
};

describe('addTemplateToEnvelope', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getEnvelopeWhereInput.mockResolvedValue({ envelopeWhereInput: { id: targetEnvelope.id } });
    mocks.prisma.envelope.findFirst.mockResolvedValue(targetEnvelope);
    mocks.getAccessibleTemplate.mockResolvedValue({
      id: 1,
      envelopeId: 'template_1',
      recipients: [{ id: 1, role: 'SIGNER', signingOrder: 1 }],
      fields: [sourceField, sourceChildField],
    });
    mocks.prisma.envelopeItem.findFirst.mockResolvedValue({
      id: 'template_item_1',
      envelopeId: 'template_1',
      title: 'Agreement.pdf',
      documentData: { id: 'source_data', data: Buffer.from('source') },
    });
    mocks.getEnvelopeItemPermissions.mockReturnValue({ canFileBeChanged: true });
    mocks.resolveTemplateRecipient.mockImplementation(({ recipients }: { recipients: unknown[] }) => recipients[0]);
    mocks.canRecipientFieldsBeModified.mockReturnValue(true);
    mocks.getFileServerSide.mockResolvedValue(Buffer.from('source'));
    mocks.putNormalizedPdfFileServerSide.mockResolvedValue({ type: 'application/pdf', data: Buffer.from('copy') });
    mocks.prisma.documentData.create.mockResolvedValue({ id: 'new_data' });
    mocks.createDocumentAuditLogData.mockImplementation((data: unknown) => data);
  });

  it('copies the selected PDF, fields, field groups, and conditional rules', async () => {
    const tx = {
      envelopeItem: {
        create: vi.fn().mockResolvedValue({
          id: 'new_item',
          title: 'Agreement',
          envelopeId: targetEnvelope.id,
          order: 1,
          documentDataId: 'new_data',
        }),
      },
      fieldGroup: {
        create: vi.fn(),
      },
      field: {
        create: vi
          .fn()
          .mockImplementation(({ data }: { data: { secondaryId?: string } }) =>
            Promise.resolve({ ...data, id: Math.random(), secondaryId: data.secondaryId ?? 'field' }),
          ),
      },
      conditionalFieldRule: {
        createMany: vi.fn(),
      },
      documentAuditLog: {
        create: vi.fn(),
        createMany: vi.fn(),
      },
    };

    mocks.prisma.$transaction.mockImplementation(async (callback: (transaction: typeof tx) => unknown) => callback(tx));

    const result = await addTemplateToEnvelope({
      userId: 1,
      teamId: 1,
      envelopeId: targetEnvelope.id,
      templateId: 1,
      templateItemId: 'template_item_1',
      requestMetadata: {} as never,
    });

    expect(mocks.getFileServerSide).toHaveBeenCalledWith(expect.objectContaining({ id: 'source_data' }));
    expect(mocks.prisma.documentData.create).toHaveBeenCalledWith({
      data: {
        type: 'application/pdf',
        data: Buffer.from('copy'),
        initialData: Buffer.from('source'),
      },
    });
    expect(tx.fieldGroup.create).toHaveBeenCalledTimes(1);
    expect(tx.field.create).toHaveBeenCalledTimes(2);
    expect(tx.field.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          templateSourceItemId: 'template_item_1',
        }),
      }),
    );
    expect(tx.conditionalFieldRule.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          operator: 'EQUALS',
          value: 'show',
        }),
      ],
    });
    expect(result.envelopeItem.title).toBe('Agreement');
  });

  it('allows adding a template document that has no fields', async () => {
    mocks.getAccessibleTemplate.mockResolvedValue({
      id: 1,
      envelopeId: 'template_1',
      recipients: [],
      fields: [],
    });

    const tx = {
      envelopeItem: {
        create: vi.fn().mockResolvedValue({ id: 'new_item', title: 'Agreement', documentDataId: 'new_data' }),
      },
      fieldGroup: { create: vi.fn() },
      field: { create: vi.fn() },
      conditionalFieldRule: { createMany: vi.fn() },
      documentAuditLog: { create: vi.fn(), createMany: vi.fn() },
    };

    mocks.prisma.$transaction.mockImplementation(async (callback: (transaction: typeof tx) => unknown) => callback(tx));

    const result = await addTemplateToEnvelope({
      userId: 1,
      teamId: 1,
      envelopeId: targetEnvelope.id,
      templateId: 1,
      templateItemId: 'template_item_1',
      requestMetadata: {} as never,
    });

    expect(result.fields).toEqual([]);
    expect(tx.field.create).not.toHaveBeenCalled();
  });
});
