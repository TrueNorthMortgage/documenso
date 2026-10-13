import { DocumentStatus, DocumentVisibility, EnvelopeType, TeamMemberRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppErrorCode } from '../../errors/app-error';

const mocks = vi.hoisted(() => ({
  findEnvelope: vi.fn(),
  updateEnvelope: vi.fn(),
  createAuditLogs: vi.fn(),
  transaction: vi.fn(),
  getEnvelopeWhereInput: vi.fn(),
  triggerWebhook: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({
  prisma: { envelope: { findFirst: mocks.findEnvelope }, $transaction: mocks.transaction },
}));
vi.mock('./get-envelope-by-id', () => ({ getEnvelopeWhereInput: mocks.getEnvelopeWhereInput }));
vi.mock('../recipient/update-recipient-next-reminder', () => ({ recomputeNextReminderForEnvelope: vi.fn() }));
vi.mock('../webhooks/trigger/trigger-webhook', () => ({ triggerWebhook: mocks.triggerWebhook }));
vi.mock('../../types/webhook-payload', () => ({
  mapEnvelopeToWebhookDocumentPayload: () => ({}),
  ZWebhookDocumentSchema: { parse: (value: unknown) => value },
}));

import { type UpdateEnvelopeOptions, updateEnvelope } from './update-envelope';

const createEnvelope = (type: EnvelopeType = EnvelopeType.DOCUMENT) => ({
  id: 'envelope_1',
  userId: 1,
  type,
  title: 'Original title',
  visibility: DocumentVisibility.MANAGER_AND_ABOVE,
  status: DocumentStatus.DRAFT,
  authOptions: { globalAccessAuth: [], globalActionAuth: [] },
  team: { organisation: { organisationClaim: { flags: { cfr21: false } } } },
  recipients: [],
  documentMeta: {},
});

const options: UpdateEnvelopeOptions = {
  userId: 1,
  teamId: 1,
  id: { type: 'envelopeId', id: 'envelope_1' },
  requestMetadata: { source: 'app', auth: 'session', requestMetadata: {} },
};

describe('updateEnvelope visibility permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const envelope = createEnvelope();
    mocks.findEnvelope.mockResolvedValue(envelope);
    mocks.updateEnvelope.mockResolvedValue(envelope);
    mocks.getEnvelopeWhereInput.mockResolvedValue({
      envelopeWhereInput: { id: envelope.id },
      team: { currentTeamRole: TeamMemberRole.MEMBER },
    });
    mocks.transaction.mockImplementation(async (callback) =>
      callback({
        envelope: { update: mocks.updateEnvelope },
        documentAuditLog: { createMany: mocks.createAuditLogs },
      }),
    );
  });

  it('rejects a member owner changing document visibility before any write', async () => {
    await expect(
      updateEnvelope({ ...options, data: { visibility: DocumentVisibility.EVERYONE } }),
    ).rejects.toMatchObject({
      code: AppErrorCode.FORBIDDEN,
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.updateEnvelope).not.toHaveBeenCalled();
  });

  it('allows a member owner to save a title while resending unchanged document visibility', async () => {
    await updateEnvelope({
      ...options,
      data: { title: 'Updated title', visibility: DocumentVisibility.MANAGER_AND_ABOVE },
    });
    expect(mocks.updateEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: 'Updated title', visibility: DocumentVisibility.MANAGER_AND_ABOVE }),
      }),
    );
  });

  it("preserves a member template owner's existing visibility permissions", async () => {
    const template = createEnvelope(EnvelopeType.TEMPLATE);
    mocks.findEnvelope.mockResolvedValue(template);
    mocks.updateEnvelope.mockResolvedValue(template);

    await updateEnvelope({ ...options, data: { visibility: DocumentVisibility.EVERYONE } });
    expect(mocks.updateEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ visibility: DocumentVisibility.EVERYONE }),
      }),
    );
    expect(mocks.triggerWebhook).toHaveBeenCalledOnce();
  });

  it('allows a manager to change document visibility', async () => {
    mocks.getEnvelopeWhereInput.mockResolvedValue({
      envelopeWhereInput: { id: 'envelope_1' },
      team: { currentTeamRole: TeamMemberRole.MANAGER },
    });
    await updateEnvelope({ ...options, data: { visibility: DocumentVisibility.EVERYONE } });
    expect(mocks.updateEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ visibility: DocumentVisibility.EVERYONE }),
      }),
    );
  });
});
