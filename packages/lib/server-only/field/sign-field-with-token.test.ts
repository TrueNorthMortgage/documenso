import { DocumentStatus, FieldType, RecipientRole, SigningStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  recipient: vi.fn(),
  field: vi.fn(),
  meta: vi.fn(),
  transaction: vi.fn(),
  visible: vi.fn(),
  auth: vi.fn(),
  correcting: vi.fn(),
  expired: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({
  prisma: {
    recipient: { findFirstOrThrow: mocks.recipient },
    field: { findFirstOrThrow: mocks.field },
    $transaction: mocks.transaction,
    documentMeta: { findFirst: mocks.meta },
  },
}));
vi.mock('./assert-conditional-field-visible', () => ({ assertConditionalFieldIsVisible: mocks.visible }));
vi.mock('./clear-hidden-conditional-fields', () => ({ clearHiddenConditionalFields: vi.fn() }));
vi.mock('../document/validate-field-auth', () => ({ validateFieldAuth: mocks.auth }));
vi.mock('../envelope/assert-envelope-not-correcting', () => ({ assertEnvelopeNotCorrecting: mocks.correcting }));
vi.mock('../../utils/recipients', () => ({ assertRecipientNotExpired: mocks.expired }));

import { signFieldWithToken } from './sign-field-with-token';

const recipient = {
  id: 1,
  token: 'test-token',
  role: RecipientRole.SIGNER,
  signingStatus: SigningStatus.NOT_SIGNED,
  email: 'test@example.test',
  name: 'Tom',
};

const field = {
  id: 2,
  secondaryId: 'field-2',
  type: FieldType.INITIALS,
  inserted: true,
  customText: 'T',
  fieldGroupId: null,
  fieldGroup: null,
  fieldMeta: { type: 'initials', readOnly: false },
  recipientId: 1,
  recipient,
  envelopeItemId: 'item-1',
  envelope: { id: 'envelope-1', deletedAt: null, status: DocumentStatus.PENDING },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recipient.mockResolvedValue(recipient);
  mocks.field.mockResolvedValue(field);
  mocks.meta.mockResolvedValue(null);
  mocks.auth.mockResolvedValue(undefined);
});

describe('correcting filled legacy identity fields', () => {
  it.each([
    FieldType.INITIALS,
    FieldType.NAME,
  ])('updates a filled %s field through the normal audited signing path', async (type) => {
    mocks.field.mockResolvedValue({ ...field, type });
    const update = vi.fn().mockResolvedValue({ ...field, customText: 'TW' });
    const audit = vi.fn().mockResolvedValue({});
    mocks.transaction.mockImplementation(async (callback) =>
      callback({ field: { update }, documentAuditLog: { create: audit } }),
    );

    const updated = await signFieldWithToken({ token: recipient.token, fieldId: 2, value: 'TW' });

    expect(updated.customText).toBe('TW');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { customText: 'TW', inserted: true } }));
    expect(audit).toHaveBeenCalledTimes(1);
    expect(mocks.auth).toHaveBeenCalledTimes(1);
  });

  it.each([DocumentStatus.COMPLETED, DocumentStatus.DRAFT])('rejects corrections for %s envelopes', async (status) => {
    mocks.field.mockResolvedValue({ ...field, envelope: { ...field.envelope, status } });

    await expect(signFieldWithToken({ token: recipient.token, fieldId: 2, value: 'TW' })).rejects.toThrow(
      'must be pending',
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('rejects corrections when the recipient has completed signing', async () => {
    mocks.recipient.mockResolvedValue({ ...recipient, signingStatus: SigningStatus.SIGNED });

    await expect(signFieldWithToken({ token: recipient.token, fieldId: 2, value: 'TW' })).rejects.toThrow(
      'already signed',
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('does not allow overwriting other filled field types', async () => {
    mocks.field.mockResolvedValue({ ...field, type: FieldType.EMAIL });

    await expect(signFieldWithToken({ token: recipient.token, fieldId: 2, value: 'tom@example.test' })).rejects.toThrow(
      'already been inserted',
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('does not allow correcting a read-only initials field', async () => {
    mocks.field.mockResolvedValue({ ...field, fieldMeta: { ...field.fieldMeta, readOnly: true } });

    await expect(signFieldWithToken({ token: recipient.token, fieldId: 2, value: 'TW' })).rejects.toThrow(
      'already been inserted',
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('does not allow correcting a read-only initials group', async () => {
    mocks.field.mockResolvedValue({ ...field, fieldGroupId: 'group-1', fieldGroup: { readOnly: true } });

    await expect(signFieldWithToken({ token: recipient.token, fieldId: 2, value: 'TW' })).rejects.toThrow(
      'already been inserted',
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('rejects corrections to a completed assistant target', async () => {
    mocks.field.mockResolvedValue({ ...field, recipient: { ...recipient, signingStatus: SigningStatus.SIGNED } });

    await expect(signFieldWithToken({ token: recipient.token, fieldId: 2, value: 'TW' })).rejects.toThrow(
      'already signed',
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
