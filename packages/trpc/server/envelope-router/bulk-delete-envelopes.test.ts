import { EnvelopeType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  deleteDocument: vi.fn(),
  deleteTemplate: vi.fn(),
  getWhere: vi.fn(),
}));
vi.mock('@documenso/prisma', () => ({ prisma: { envelope: { findMany: mocks.findMany } } }));
vi.mock('@documenso/lib/server-only/document/delete-document', () => ({ deleteDocument: mocks.deleteDocument }));
vi.mock('@documenso/lib/server-only/template/delete-template', () => ({ deleteTemplate: mocks.deleteTemplate }));
vi.mock('@documenso/lib/server-only/envelope/get-envelopes-by-ids', () => ({
  getMultipleEnvelopeWhereInput: mocks.getWhere,
}));
vi.mock('../trpc', () => ({
  authenticatedProcedure: {
    input: () => ({ output: () => ({ mutation: (handler: unknown) => handler }) }),
  },
}));

import { bulkDeleteEnvelopesRoute } from './bulk-delete-envelopes';

const ctx = {
  teamId: 2,
  user: { id: 1 },
  metadata: { source: 'app', requestMetadata: {} },
  logger: { info: vi.fn(), warn: vi.fn() },
};
const invoke = bulkDeleteEnvelopesRoute as unknown as (options: {
  input: { envelopeIds: string[]; cancellationReason?: string };
  ctx: typeof ctx;
}) => Promise<{ deletedCount: number; failedIds: string[] }>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getWhere.mockResolvedValue({ envelopeWhereInput: { teamId: 2 } });
  mocks.findMany.mockResolvedValue([
    { id: 'document_1', type: EnvelopeType.DOCUMENT },
    { id: 'document_2', type: EnvelopeType.DOCUMENT },
    { id: 'template_1', type: EnvelopeType.TEMPLATE },
  ]);
  mocks.deleteDocument.mockResolvedValue({});
  mocks.deleteTemplate.mockResolvedValue({});
});

describe('Home bulk cancellation message', () => {
  it('forwards the message for every document and keeps templates on their existing path', async () => {
    const result = await invoke({
      input: {
        envelopeIds: ['document_1', 'document_2', 'template_1'],
        cancellationReason: 'Please use the updated package.',
      },
      ctx,
    });
    expect(mocks.deleteDocument).toHaveBeenCalledTimes(2);
    for (const [options] of mocks.deleteDocument.mock.calls) {
      expect(options.cancellationReason).toBe('Please use the updated package.');
    }
    expect(mocks.deleteTemplate.mock.calls[0][0]).not.toHaveProperty('cancellationReason');
    expect(result).toEqual({ deletedCount: 3, failedIds: [] });
  });

  it('retains the optional-message contract and permission filtering', async () => {
    const result = await invoke({
      input: { envelopeIds: ['document_1', 'document_2', 'template_1', 'not_accessible'] },
      ctx,
    });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { teamId: 2 } }));
    expect(mocks.deleteDocument.mock.calls[0][0].cancellationReason).toBeUndefined();
    expect(result).toEqual({ deletedCount: 3, failedIds: ['not_accessible'] });
  });
});
