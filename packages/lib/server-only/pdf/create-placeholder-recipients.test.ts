import type { Prisma } from '@prisma/client';
import { RecipientRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getRecipientsWithInvalidEmails } from '../../utils/recipients';
import { createMissingPlaceholderRecipients } from './create-placeholder-recipients';

const existingRecipient = { id: 10, name: 'Existing signer', email: 'signer@example.com', signingOrder: null };
const findMany = vi.fn();
const createManyAndReturn = vi.fn();
const lock = vi.fn();
const tx = { $queryRaw: lock, recipient: { findMany, createManyAndReturn } } as unknown as Prisma.TransactionClient;

const importPlaceholders = (refs: string[]) =>
  createMissingPlaceholderRecipients({
    tx,
    envelopeId: 'envelope_1',
    placeholders: refs.map((recipient) => ({ recipient })),
  });

beforeEach(() => {
  vi.clearAllMocks();
  lock.mockResolvedValue([{ type: 'DOCUMENT', correctionStartedAt: null }]);
  findMany.mockResolvedValue([existingRecipient]);
  createManyAndReturn.mockImplementation(async ({ data }) =>
    data.map((recipient: Prisma.RecipientCreateManyInput, index: number) => ({ ...recipient, id: 20 + index })),
  );
});

describe('placeholder recipient creation', () => {
  it('rejects missing recipient slots during correction without creating recipients', async () => {
    lock.mockResolvedValue([{ type: 'DOCUMENT', correctionStartedAt: new Date() }]);
    await expect(importPlaceholders(['r2'])).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      statusCode: 400,
      userMessage: expect.stringContaining('Recipients cannot be added in Correct mode.'),
    });
    expect(createManyAndReturn).not.toHaveBeenCalled();
  });

  it('allows placeholders for existing recipients during correction', async () => {
    lock.mockResolvedValue([{ type: 'DOCUMENT', correctionStartedAt: new Date() }]);
    const result = await importPlaceholders(['r1']);
    expect(result.recipients).toEqual([existingRecipient]);
    expect(result.addedRecipients).toEqual([]);
    expect(createManyAndReturn).not.toHaveBeenCalled();
  });

  it('rejects a missing envelope without creating recipients', async () => {
    lock.mockResolvedValue([]);
    await expect(importPlaceholders(['r2'])).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(createManyAndReturn).not.toHaveBeenCalled();
  });

  it('preserves r1 and adds a draft r2 with an email that must be filled before sending', async () => {
    const result = await importPlaceholders(['r1', 'r2']);
    expect(result.recipients[0]).toEqual(existingRecipient);
    expect(result.addedRecipients).toHaveLength(1);
    expect(result.addedRecipients[0]).toMatchObject({
      name: 'Recipient 2',
      email: '',
      role: RecipientRole.SIGNER,
      signingOrder: null,
    });
    expect(getRecipientsWithInvalidEmails(result.addedRecipients)).toEqual(result.addedRecipients);
    expect(lock.mock.invocationCallOrder[0]).toBeLessThan(findMany.mock.invocationCallOrder[0]);
  });

  it('creates all missing slots for a sparse r3 reference without changing existing recipient order', async () => {
    const result = await importPlaceholders(['r3']);
    expect(result.recipients.map((recipient) => recipient.name)).toEqual([
      'Existing signer',
      'Recipient 2',
      'Recipient 3',
    ]);
    expect(result.recipients[0].signingOrder).toBeNull();
  });

  it('creates recipients when an empty envelope receives placeholders', async () => {
    findMany.mockResolvedValue([]);
    const result = await importPlaceholders(['r2']);
    expect(result.addedRecipients.map((recipient) => recipient.name)).toEqual(['Recipient 1', 'Recipient 2']);
  });

  it('keeps numbered slots stable when the database returns created recipients out of order', async () => {
    createManyAndReturn.mockImplementation(async ({ data }) =>
      data
        .map((recipient: Prisma.RecipientCreateManyInput, index: number) => ({ ...recipient, id: 20 + index }))
        .reverse(),
    );
    const result = await importPlaceholders(['r3']);
    expect(result.recipients.map((recipient) => recipient.name)).toEqual([
      'Existing signer',
      'Recipient 2',
      'Recipient 3',
    ]);
  });

  it('does not duplicate recipients for repeated references or a repeated import', async () => {
    const first = await importPlaceholders(['r2', 'r2']);
    findMany.mockResolvedValue(first.recipients);
    const second = await importPlaceholders(['r2']);
    expect(second.addedRecipients).toEqual([]);
    expect(createManyAndReturn).toHaveBeenCalledTimes(1);
  });

  it('keeps existing ordered recipients in their original slots', async () => {
    const recipients = [
      { ...existingRecipient, signingOrder: 2 },
      { ...existingRecipient, id: 11, signingOrder: null },
    ];
    findMany.mockResolvedValue(recipients);
    const result = await importPlaceholders(['r3']);
    expect(result.recipients.slice(0, 2)).toEqual(recipients);
    expect(result.recipients[2].signingOrder).toBeNull();
  });

  it.each([
    'r0',
    'r-1',
    'r1001',
    'r999999999999999999999',
    'unknown',
  ])('rejects invalid or excessive recipient reference %s without writes', async (recipient) => {
    await expect(importPlaceholders([recipient])).rejects.toMatchObject({ code: 'INVALID_BODY' });
    expect(createManyAndReturn).not.toHaveBeenCalled();
    expect(lock).not.toHaveBeenCalled();
  });
});
