import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    $executeRaw: vi.fn(),
    pendingPreparation: {
      findMany: vi.fn(),
      delete: vi.fn(),
    },
    documentData: {
      delete: vi.fn(),
    },
  },
  deleteFile: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('../../../universal/upload/delete-file', () => ({ deleteFile: mocks.deleteFile }));

import { run } from './cleanup-rate-limits.handler';

describe('cleanup-rate-limits handler', () => {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$executeRaw.mockResolvedValue(0);
    mocks.prisma.pendingPreparation.findMany.mockResolvedValue([
      {
        id: 'pending_1',
        documents: [
          {
            documentData: {
              id: 'data_1',
              type: 'S3_PATH',
              data: 'uploads/data_1.pdf',
              envelopeItem: null,
            },
          },
        ],
      },
      {
        id: 'pending_2',
        documents: [
          {
            documentData: {
              id: 'data_2',
              type: 'BYTES',
              data: 'encoded-data',
              envelopeItem: null,
            },
          },
        ],
      },
      {
        id: 'pending_3',
        documents: [
          {
            documentData: {
              id: 'data_3',
              type: 'S3_PATH',
              data: 'uploads/data_3.pdf',
              envelopeItem: null,
            },
          },
        ],
      },
    ]);
  });

  it('cleans expired pending and already-expired preparations with their files', async () => {
    await run({ payload: {} as never, io: { logger } as never });

    expect(mocks.prisma.pendingPreparation.findMany).toHaveBeenCalledWith({
      where: {
        expiresAt: { lt: expect.any(Date) },
        OR: [{ status: { in: ['PENDING', 'EXPIRED'] } }, { status: 'COMMITTED', committedEnvelopeId: null }],
      },
      select: {
        id: true,
        documents: {
          select: {
            documentData: {
              select: {
                id: true,
                type: true,
                data: true,
                envelopeItem: { select: { id: true } },
              },
            },
          },
        },
      },
    });
    expect(mocks.deleteFile).toHaveBeenNthCalledWith(1, { type: 'S3_PATH', data: 'uploads/data_1.pdf' });
    expect(mocks.deleteFile).toHaveBeenNthCalledWith(2, { type: 'BYTES', data: 'encoded-data' });
    expect(mocks.deleteFile).toHaveBeenNthCalledWith(3, { type: 'S3_PATH', data: 'uploads/data_3.pdf' });
    expect(mocks.prisma.documentData.delete).toHaveBeenCalledTimes(3);
    expect(mocks.prisma.pendingPreparation.delete).toHaveBeenCalledTimes(3);
  });
});
