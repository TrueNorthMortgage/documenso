import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ZBulkReassignEnvelopeSenderRequestSchema } from '../../../trpc/server/envelope-router/bulk-reassign-envelope-sender.types';
import { AppError, AppErrorCode } from '../../errors/app-error';

vi.mock('./reassign-envelope-sender', () => ({ reassignEnvelopeSender: vi.fn() }));

import { bulkReassignEnvelopeSender } from './bulk-reassign-envelope-sender';
import { reassignEnvelopeSender } from './reassign-envelope-sender';

const reassign = vi.mocked(reassignEnvelopeSender);
const options = {
  userId: 1,
  teamId: 2,
  newOwnerId: 20,
  requestMetadata: {
    source: 'app',
    auth: 'session',
    requestMetadata: {},
    auditUser: { id: 1, name: 'Manager', email: 'manager@example.com' },
  },
} as const;
const envelopes = [
  { envelopeId: 'first', expectedOwnerId: 10 },
  { envelopeId: 'second', expectedOwnerId: 11 },
  { envelopeId: 'third', expectedOwnerId: 12 },
];

beforeEach(() => {
  vi.resetAllMocks();
  reassign.mockImplementation(async ({ envelopeId }) => ({ id: envelopeId }));
});

describe('bulkReassignEnvelopeSender', () => {
  it('passes the authenticated actor, team, metadata and expected owner to every transfer', async () => {
    expect(await bulkReassignEnvelopeSender({ ...options, envelopes })).toEqual({
      succeededIds: ['first', 'second', 'third'],
      failed: [],
    });
    expect(reassign.mock.calls.map(([input]) => input)).toEqual(
      envelopes.map((envelope) => ({ ...options, ...envelope })),
    );
  });

  it('continues after an inaccessible envelope and returns only safe failure messages', async () => {
    reassign.mockRejectedValueOnce(new AppError(AppErrorCode.FORBIDDEN, { message: 'Private access detail' }));
    reassign.mockRejectedValueOnce(
      new AppError(AppErrorCode.INVALID_REQUEST, { userMessage: 'The sender has changed.' }),
    );
    expect(await bulkReassignEnvelopeSender({ ...options, envelopes })).toEqual({
      succeededIds: ['third'],
      failed: [
        { envelopeId: 'first', message: 'This envelope could not be reassigned.' },
        { envelopeId: 'second', message: 'The sender has changed.' },
      ],
    });
  });

  it('does not expose database errors and permits retrying only failed transfers', async () => {
    reassign.mockRejectedValueOnce(new Error('Sensitive database details'));
    const result = await bulkReassignEnvelopeSender({ ...options, envelopes });
    expect(result.failed).toEqual([{ envelopeId: 'first', message: 'This envelope could not be reassigned.' }]);
    reassign.mockClear();
    await bulkReassignEnvelopeSender({
      ...options,
      envelopes: envelopes.filter(({ envelopeId }) => !result.succeededIds.includes(envelopeId)),
    });
    expect(reassign).toHaveBeenCalledTimes(1);
    expect(reassign).toHaveBeenCalledWith({ ...options, ...envelopes[0] });
  });
});

describe('bulk reassignment request validation', () => {
  it('allows 100 unique envelopes', () => {
    const selection = Array.from({ length: 100 }, (_, index) => ({
      envelopeId: `envelope_${index}`,
      expectedOwnerId: 10,
    }));
    expect(ZBulkReassignEnvelopeSenderRequestSchema.safeParse({ newOwnerId: 20, envelopes: selection }).success).toBe(
      true,
    );
  });

  it.each(
    [
      [],
      Array.from({ length: 101 }, (_, index) => ({ envelopeId: `envelope_${index}`, expectedOwnerId: 10 })),
      [envelopes[0], envelopes[0]],
      [{ envelopeId: '', expectedOwnerId: 10 }],
      [{ envelopeId: 'first', expectedOwnerId: 0 }],
    ].map((selection) => [selection]),
  )('rejects an empty, oversized, duplicate or invalid selection (%#)', (selection) => {
    expect(ZBulkReassignEnvelopeSenderRequestSchema.safeParse({ newOwnerId: 20, envelopes: selection }).success).toBe(
      false,
    );
  });
});
