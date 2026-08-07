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

  it('authorizes a committed replay before returning its envelope', async () => {
    mocks.prisma.pendingPreparation.findUnique.mockResolvedValue({
      ...pending,
      status: 'COMMITTED',
      committedEnvelopeId: 'envelope_1',
    });

    await expect(
      commitPendingPreparation({
        id: pending.id,
        userId: 1,
        userEmail: 'other@example.com',
        requestMetadata: {} as never,
      }),
    ).rejects.toThrow('Pending preparation does not belong to this user');

    expect(mocks.prisma.envelope.findUnique).not.toHaveBeenCalled();
  });

  it('recovers a stale committed claim without an envelope', async () => {
    const stalePending = {
      ...pending,
      status: 'COMMITTED' as const,
      updatedAt: new Date(Date.now() - 31 * 60 * 1000),
    };

    mocks.prisma.pendingPreparation.findUnique.mockResolvedValueOnce(stalePending).mockResolvedValueOnce(pending);
    mocks.prisma.envelope.findFirst.mockResolvedValue(null);
    mocks.createEnvelope.mockResolvedValue({ id: 'envelope_1' } as never);

    await expect(
      commitPendingPreparation({
        id: pending.id,
        userId: 1,
        userEmail: pending.actorEmail,
        requestMetadata: {} as never,
      }),
    ).resolves.toEqual({ id: 'envelope_1' });

    expect(mocks.prisma.pendingPreparation.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: pending.id,
        status: 'COMMITTED',
        committedEnvelopeId: null,
        updatedAt: { lt: expect.any(Date) },
      },
      data: { status: 'PENDING' },
    });
  });

  it('retries template distribution when a committed envelope is still a draft', async () => {
    const committedPending = {
      ...pending,
      status: 'COMMITTED' as const,
      committedEnvelopeId: 'envelope_1',
      payload: {
        kind: 'template',
        distributeDocument: true,
      },
    };
    const draftEnvelope = { id: 'envelope_1', status: 'DRAFT' };
    const sentEnvelope = { id: 'envelope_1', status: 'PENDING' };

    mocks.prisma.pendingPreparation.findUnique.mockResolvedValue(committedPending);
    mocks.prisma.envelope.findUnique.mockResolvedValue(draftEnvelope as never);
    mocks.sendDocument.mockResolvedValue(sentEnvelope as never);

    await expect(
      commitPendingPreparation({
        id: pending.id,
        userId: 1,
        userEmail: pending.actorEmail,
        requestMetadata: {} as never,
      }),
    ).resolves.toEqual(sentEnvelope);

    expect(mocks.sendDocument).toHaveBeenCalledWith({
      id: { type: 'envelopeId', id: 'envelope_1' },
      userId: 1,
      teamId: pending.teamId,
      requestMetadata: {},
    });
  });
});
