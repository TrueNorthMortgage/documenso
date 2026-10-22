import { DocumentStatus, FieldType, RecipientRole, SigningStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findRecipient: vi.fn(),
  currentRecipient: vi.fn(),
  fields: vi.fn(),
  upsert: vi.fn(),
  audit: vi.fn(),
  auth: vi.fn(),
  lock: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('@documenso/prisma', () => ({
  prisma: { recipient: { findFirst: mocks.findRecipient }, $transaction: mocks.transaction },
}));
vi.mock('../document/validate-field-auth', () => ({ validateFieldAuth: mocks.auth }));
vi.mock('../envelope/assert-envelope-not-correcting', () => ({ assertEnvelopeNotCorrecting: vi.fn() }));
vi.mock('../../utils/recipients', () => ({ assertRecipientNotExpired: vi.fn() }));

import { replaceFilledSignatures } from './replace-filled-signatures';

const recipient = {
  id: 1,
  envelopeId: 'env-1',
  role: RecipientRole.SIGNER,
  signingStatus: SigningStatus.NOT_SIGNED,
  email: 'test@example.test',
  name: 'Tom',
  envelope: {
    id: 'env-1',
    status: DocumentStatus.PENDING,
    deletedAt: null,
    internalVersion: 2,
    documentMeta: { typedSignatureEnabled: true },
    authOptions: {},
  },
};
const field = {
  id: 1,
  secondaryId: 'field-1',
  recipientId: 1,
  type: FieldType.SIGNATURE,
  inserted: true,
  customText: '',
  fieldMeta: null,
  fieldGroup: null,
  conditionalChildRule: null,
  envelopeItemId: 'item-1',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findRecipient.mockResolvedValue(recipient);
  mocks.currentRecipient.mockResolvedValue(recipient);
  mocks.fields.mockResolvedValue([field, { ...field, id: 2, secondaryId: 'field-2' }]);
  mocks.auth.mockResolvedValue(undefined);
  mocks.upsert.mockImplementation(async ({ where, update }) => ({
    id: where.fieldId,
    fieldId: where.fieldId,
    ...update,
  }));
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      $queryRaw: mocks.lock,
      recipient: { findUniqueOrThrow: mocks.currentRecipient },
      field: { findMany: mocks.fields },
      signature: { upsert: mocks.upsert },
      documentAuditLog: { create: mocks.audit },
    }),
  );
});

describe('replacing filled signatures', () => {
  it('authenticates once for an atomic replacement and audits every filled signature', async () => {
    const result = await replaceFilledSignatures({ token: 'token', value: 'Corrected' });

    expect(result).toHaveLength(2);
    expect(mocks.auth).toHaveBeenCalledTimes(1);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.lock).toHaveBeenCalledTimes(2);
    expect(mocks.audit).toHaveBeenCalledTimes(2);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { typedSignature: 'Corrected', signatureImageAsBase64: null, typedSignatureFont: null },
      }),
    );
  });

  it('leaves empty fields, other recipients, non-signature fields and read-only fields untouched', async () => {
    mocks.fields.mockResolvedValue([
      field,
      { ...field, id: 2, inserted: false },
      { ...field, id: 3, recipientId: 2 },
      { ...field, id: 4, type: FieldType.NAME },
      { ...field, id: 5, fieldMeta: { readOnly: true } },
      { ...field, id: 6, fieldGroup: { type: FieldType.SIGNATURE, readOnly: true } },
    ]);

    const result = await replaceFilledSignatures({ token: 'token', value: 'Corrected' });

    expect(result.map((entry) => entry.id)).toEqual([1]);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  it.each([
    DocumentStatus.COMPLETED,
    DocumentStatus.DRAFT,
  ])('rejects %s documents after acquiring completion locks', async (status) => {
    mocks.currentRecipient.mockResolvedValue({ ...recipient, envelope: { ...recipient.envelope, status } });
    await expect(replaceFilledSignatures({ token: 'token', value: 'Corrected' })).rejects.toThrow();
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it('rejects a signer who completed while authentication was in progress', async () => {
    mocks.currentRecipient.mockResolvedValue({ ...recipient, signingStatus: SigningStatus.SIGNED });
    await expect(replaceFilledSignatures({ token: 'token', value: 'Corrected' })).rejects.toThrow();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('rejects assistants and invalid authentication without writing signatures', async () => {
    mocks.currentRecipient.mockResolvedValueOnce({ ...recipient, role: RecipientRole.ASSISTANT });
    await expect(replaceFilledSignatures({ token: 'token', value: 'Corrected' })).rejects.toThrow();
    mocks.auth.mockRejectedValueOnce(new Error('Invalid authentication'));
    await expect(replaceFilledSignatures({ token: 'token', value: 'Corrected' })).rejects.toThrow(
      'Invalid authentication',
    );
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('respects the typed signature restriction', async () => {
    mocks.currentRecipient.mockResolvedValue({
      ...recipient,
      envelope: { ...recipient.envelope, documentMeta: { typedSignatureEnabled: false } },
    });
    await expect(replaceFilledSignatures({ token: 'token', value: 'Corrected' })).rejects.toThrow(
      'Typed signatures are not allowed',
    );
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('does not authenticate or insert a signature when all fields are empty', async () => {
    mocks.fields.mockResolvedValue([{ ...field, inserted: false }]);
    expect(await replaceFilledSignatures({ token: 'token', value: 'Corrected' })).toEqual([]);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
