import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    pendingPreparation: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    team: {
      findFirst: vi.fn(),
    },
    envelope: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  },
  getServerLimits: vi.fn(),
  createEnvelope: vi.fn(),
  createDocumentFromTemplate: vi.fn(),
  sendDocument: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@documenso/ee/server-only/limits/server', () => ({ getServerLimits: mocks.getServerLimits }));
vi.mock('../envelope/create-envelope', () => ({ createEnvelope: mocks.createEnvelope }));
vi.mock('../template/create-document-from-template', () => ({
  createDocumentFromTemplate: mocks.createDocumentFromTemplate,
}));
vi.mock('../document/send-document', () => ({ sendDocument: mocks.sendDocument }));
vi.mock('../../../trpc/server/envelope-router/create-envelope.types', () => ({
  ZCreateEnvelopePayloadSchema: { parse: (payload: unknown) => payload },
}));
vi.mock('../../../trpc/server/template-router/schema', () => ({
  ZCreateDocumentFromTemplateRequestSchema: { parse: (payload: unknown) => payload },
}));

import { commitPendingPreparation } from './commit-pending-preparation';

const pending = {
  id: 'pending_1',
  organisationId: 'organisation_1',
  teamId: 1,
  actorEmail: 'actor@example.com',
  payload: {
    type: 'DOCUMENT',
    title: 'document.pdf',
    recipients: [],
  },
  status: 'PENDING' as const,
  expiresAt: new Date(Date.now() + 60_000),
  committedEnvelopeId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  documents: [],
};

describe('commitPendingPreparation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.pendingPreparation.findUnique.mockResolvedValue(pending);
    mocks.prisma.team.findFirst.mockResolvedValue({ id: 1 });
    mocks.prisma.pendingPreparation.updateMany.mockResolvedValue({ count: 1 });
    mocks.getServerLimits.mockResolvedValue({ remaining: { documents: 1 } });
  });

  it('releases the claim when envelope creation fails', async () => {
    const error = new Error('creation failed');
    mocks.createEnvelope.mockRejectedValue(error);

    await expect(
      commitPendingPreparation({
        id: pending.id,
        userId: 1,
        userEmail: pending.actorEmail,
        requestMetadata: {} as never,
      }),
    ).rejects.toBe(error);

    expect(mocks.prisma.pendingPreparation.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: pending.id,
        status: 'COMMITTED',
        committedEnvelopeId: null,
      },
      data: { status: 'PENDING' },
    });
  });

  it('rechecks the document limit after claiming and before creation', async () => {
    mocks.getServerLimits.mockResolvedValue({ remaining: { documents: 0 } });

    await expect(
      commitPendingPreparation({
        id: pending.id,
        userId: 1,
        userEmail: pending.actorEmail,
        requestMetadata: {} as never,
      }),
    ).rejects.toThrow('You have reached your document limit');

    expect(mocks.createEnvelope).not.toHaveBeenCalled();
    expect(mocks.prisma.pendingPreparation.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: pending.id,
        status: 'COMMITTED',
        committedEnvelopeId: null,
      },
      data: { status: 'PENDING' },
    });
  });
});
