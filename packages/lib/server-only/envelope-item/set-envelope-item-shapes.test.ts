import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  transaction: vi.fn(),
  updateMany: vi.fn(),
  lockEnvelope: vi.fn(),
  createAudit: vi.fn(),
  getWhere: vi.fn(),
  pageCounts: vi.fn(),
  assertTemplate: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock('@documenso/prisma', () => ({
  prisma: { envelope: { findFirst: mocks.findFirst }, $transaction: mocks.transaction },
}));
vi.mock('../envelope/get-envelope-by-id', () => ({ getEnvelopeWhereInput: mocks.getWhere }));
vi.mock('../pdf/get-envelope-item-page-counts', () => ({ getEnvelopeItemPageCounts: mocks.pageCounts }));
vi.mock('../template/validate-template-access', () => ({ assertCanManageTemplate: mocks.assertTemplate }));
vi.mock('../../utils/document-audit-logs', () => ({ createDocumentAuditLogData: (input: unknown) => input }));

import { setEnvelopeItemShapes } from './set-envelope-item-shapes';

const shape = {
  id: '00000000-0000-4000-8000-000000000001',
  type: 'line',
  page: 1,
  positionX: 10,
  positionY: 20,
  width: 30,
  height: 0,
  color: '#000000',
  thickness: 2,
};
const envelope = {
  id: 'env_1',
  userId: 1,
  type: 'DOCUMENT',
  internalVersion: 2,
  status: 'DRAFT',
  correctionStartedAt: null,
  envelopeItems: [{ id: 'item_1', shapes: [], documentData: {} }],
};
const options = {
  userId: 1,
  teamId: 1,
  envelopeId: 'env_1',
  envelopeItemId: 'item_1',
  shapes: [shape],
  previousShapes: [],
  requestMetadata: {
    source: 'app',
    auth: 'session',
    requestMetadata: { ipAddress: '127.0.0.1', userAgent: 'test' },
    auditUser: { id: 1, name: 'Sender', email: 'sender@example.test' },
  },
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getWhere.mockResolvedValue({ envelopeWhereInput: { id: 'env_1' }, team: { currentTeamRole: 'ADMIN' } });
  mocks.findFirst.mockResolvedValue(structuredClone(envelope));
  mocks.pageCounts.mockResolvedValue(new Map([['item_1', 2]]));
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.lockEnvelope.mockResolvedValue({ count: 1 });
  mocks.getUser.mockResolvedValue({ name: 'Sender', email: 'sender@example.test' });
  mocks.transaction.mockImplementation(async (callback) =>
    callback({
      envelope: { updateMany: mocks.lockEnvelope },
      envelopeItem: { updateMany: mocks.updateMany },
      documentAuditLog: { create: mocks.createAudit },
      user: { findUniqueOrThrow: mocks.getUser },
    }),
  );
});

describe('saving document shapes', () => {
  it('saves and clears a background while treating legacy missing fill as transparent', async () => {
    const rectangle = { ...shape, type: 'rectangle', height: 20, fillColor: null };
    mocks.findFirst.mockResolvedValue({
      ...structuredClone(envelope),
      envelopeItems: [{ id: 'item_1', shapes: [rectangle], documentData: {} }],
    });
    const legacy = { ...shape, type: 'rectangle', height: 20 };
    await expect(
      setEnvelopeItemShapes({ ...options, previousShapes: [legacy], shapes: [{ ...rectangle, fillColor: '#fedcba' }] }),
    ).resolves.toMatchObject({ shapes: [{ fillColor: '#fedcba' }] });
    const filled = { ...rectangle, fillColor: '#fedcba' };
    mocks.findFirst.mockResolvedValue({
      ...structuredClone(envelope),
      envelopeItems: [{ id: 'item_1', shapes: [filled], documentData: {} }],
    });
    await expect(
      setEnvelopeItemShapes({ ...options, previousShapes: [filled], shapes: [rectangle] }),
    ).resolves.toMatchObject({ shapes: [{ fillColor: null }] });
  });
  it('rejects a background changed by another editor', async () => {
    const rectangle = { ...shape, type: 'rectangle', height: 20 };
    mocks.findFirst.mockResolvedValue({
      ...structuredClone(envelope),
      envelopeItems: [{ id: 'item_1', shapes: [{ ...rectangle, fillColor: '#fedcba' }], documentData: {} }],
    });
    await expect(
      setEnvelopeItemShapes({
        ...options,
        previousShapes: [rectangle],
        shapes: [{ ...rectangle, fillColor: '#ffffff' }],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('allows moving and resizing after database coordinate round-tripping', async () => {
    const savedShape = { ...shape, positionY: 22.16844143272023 };
    mocks.findFirst.mockResolvedValue({
      ...structuredClone(envelope),
      envelopeItems: [{ id: 'item_1', shapes: [savedShape], documentData: {} }],
    });
    await expect(
      setEnvelopeItemShapes({
        ...options,
        previousShapes: [{ ...savedShape, positionY: 22.168441432720233 }],
        shapes: [{ ...savedShape, width: 35, positionX: 12 }],
      }),
    ).resolves.toEqual({ shapes: [{ ...savedShape, width: 35, positionX: 12 }] });
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ shapes: { equals: [savedShape] } }) }),
    );
  });

  it('still rejects a real coordinate change from another editor', async () => {
    mocks.findFirst.mockResolvedValue({
      ...structuredClone(envelope),
      envelopeItems: [{ id: 'item_1', shapes: [{ ...shape, positionY: 20.001 }] }],
    });
    await expect(setEnvelopeItemShapes({ ...options, previousShapes: [shape] })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('does not write markup when sending has already changed the envelope state', async () => {
    mocks.lockEnvelope.mockResolvedValue({ count: 0 });
    await expect(setEnvelopeItemShapes(options)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.createAudit).not.toHaveBeenCalled();
  });
  it('persists shapes and records the actor and old/new markup in the same transaction', async () => {
    await expect(setEnvelopeItemShapes(options)).resolves.toEqual({ shapes: [shape] });
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'item_1',
          envelopeId: 'env_1',
          shapes: { equals: [] },
          envelope: expect.objectContaining({ status: 'DRAFT', completedAt: null, deletedAt: null }),
        }),
        data: { shapes: [shape] },
      }),
    );
    expect(mocks.createAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'ENVELOPE_ITEM_UPDATED',
          user: { name: 'Sender', email: 'sender@example.test' },
        }),
      }),
    );
  });

  it('allows a pending envelope only during an active correction', async () => {
    mocks.findFirst.mockResolvedValue({
      ...structuredClone(envelope),
      status: 'PENDING',
      correctionStartedAt: new Date(),
    });
    await expect(setEnvelopeItemShapes(options)).resolves.toEqual({ shapes: [shape] });
  });

  it.each(['PENDING', 'COMPLETED', 'REJECTED'])('rejects %s without writing', async (status) => {
    mocks.findFirst.mockResolvedValue({ ...structuredClone(envelope), status });
    await expect(setEnvelopeItemShapes(options)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('rejects inaccessible envelopes', async () => {
    mocks.findFirst.mockResolvedValue(null);
    await expect(setEnvelopeItemShapes(options)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('rejects an item from another envelope', async () => {
    await expect(setEnvelopeItemShapes({ ...options, envelopeItemId: 'other_item' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('rejects nonexistent PDF pages', async () => {
    await expect(setEnvelopeItemShapes({ ...options, shapes: [{ ...shape, page: 3 }] })).rejects.toMatchObject({
      code: 'INVALID_BODY',
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('treats legacy borders as solid when comparing the previous snapshot', async () => {
    mocks.findFirst.mockResolvedValue({
      ...structuredClone(envelope),
      envelopeItems: [{ id: 'item_1', shapes: [shape], documentData: {} }],
    });
    await expect(
      setEnvelopeItemShapes({
        ...options,
        previousShapes: [{ ...shape, borderStyle: 'solid' }],
        shapes: [{ ...shape, borderStyle: 'dashed' }],
      }),
    ).resolves.toMatchObject({ shapes: [{ borderStyle: 'dashed' }] });
  });
  it('rejects a stale border style from another editor', async () => {
    mocks.findFirst.mockResolvedValue({
      ...structuredClone(envelope),
      envelopeItems: [{ id: 'item_1', shapes: [{ ...shape, borderStyle: 'dotted' }], documentData: {} }],
    });
    await expect(setEnvelopeItemShapes({ ...options, previousShapes: [shape] })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('rejects stale editor state instead of overwriting another editor', async () => {
    mocks.findFirst.mockResolvedValue({
      ...structuredClone(envelope),
      envelopeItems: [{ id: 'item_1', shapes: [shape] }],
    });
    await expect(setEnvelopeItemShapes(options)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('rejects a state change during saving without writing an audit event', async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(setEnvelopeItemShapes(options)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(mocks.createAudit).not.toHaveBeenCalled();
  });
});
