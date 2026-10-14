import { DocumentStatus, DocumentVisibility, EnvelopeType, TeamMemberRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getWhere: vi.fn(),
  tx: {
    $queryRaw: vi.fn(),
    folder: { findFirst: vi.fn(), create: vi.fn() },
    envelope: { findFirst: vi.fn(), updateMany: vi.fn() },
    user: { findFirst: vi.fn() },
    documentAuditLog: { create: vi.fn() },
  },
}));
vi.mock('@documenso/prisma', () => ({
  prisma: { $transaction: (callback: (tx: typeof mocks.tx) => unknown) => callback(mocks.tx) },
}));
vi.mock('./get-envelope-by-id', () => ({ getEnvelopeWhereInput: mocks.getWhere }));

import { ZDocumentAuditLogSchema } from '../../types/document-audit-logs';
import { reassignEnvelopeSender } from './reassign-envelope-sender';

const originalOwner = { id: 10, name: 'Original sender', email: 'original@example.com' };
const newOwner = { id: 20, name: 'New sender', email: 'new@example.com' };
const envelope = {
  id: 'envelope_test',
  userId: 10,
  teamId: 1,
  type: EnvelopeType.DOCUMENT,
  status: DocumentStatus.PENDING,
  completedAt: null,
  deletedAt: null,
  folderId: 'folder_original',
  user: originalOwner,
};
const options = {
  envelopeId: envelope.id,
  userId: 1,
  teamId: 1,
  newOwnerId: 20,
  expectedOwnerId: 10,
  requestMetadata: {
    source: 'app',
    auth: 'session',
    requestMetadata: {},
    auditUser: { id: 1, name: 'Manager', email: 'manager@example.com' },
  },
} as const;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getWhere.mockResolvedValue({
    envelopeWhereInput: { id: envelope.id, OR: [{ userId: 1 }, { visibility: 'EVERYONE', teamId: 1 }] },
    team: {
      currentTeamRole: TeamMemberRole.MANAGER,
      derivedSettings: { documentVisibility: DocumentVisibility.MANAGER_AND_ABOVE },
    },
  });
  mocks.tx.$queryRaw.mockResolvedValue([{ id: newOwner.id }]);
  mocks.tx.folder.findFirst.mockResolvedValue({ id: 'folder_assigned', pinned: true });
  mocks.tx.folder.create.mockResolvedValue({ id: 'folder_assigned_new' });
  mocks.tx.envelope.findFirst.mockResolvedValue(envelope);
  mocks.tx.user.findFirst.mockResolvedValue(newOwner);
  mocks.tx.envelope.updateMany.mockResolvedValue({ count: 1 });
});

describe('reassignEnvelopeSender', () => {
  it.each([
    TeamMemberRole.MANAGER,
    TeamMemberRole.ADMIN,
  ])('allows %s to transfer one pending envelope to Assigned to you', async (role) => {
    mocks.getWhere.mockResolvedValue({
      envelopeWhereInput: { id: envelope.id },
      team: { currentTeamRole: role, derivedSettings: { documentVisibility: DocumentVisibility.MANAGER_AND_ABOVE } },
    });
    expect(await reassignEnvelopeSender(options)).toEqual({ id: envelope.id });
    expect(mocks.tx.envelope.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: envelope.id,
        teamId: 1,
        type: 'DOCUMENT',
        userId: 10,
        folderId: 'folder_original',
        status: 'PENDING',
        completedAt: null,
        deletedAt: null,
      }),
      data: { userId: 20, folderId: 'folder_assigned' },
    });
  });

  it('preserves recipients, signatures, links, visibility and email settings by changing only owner and folder', async () => {
    await reassignEnvelopeSender(options);
    expect(mocks.tx.envelope.updateMany.mock.calls[0][0].data).toEqual({ userId: 20, folderId: 'folder_assigned' });
    expect(mocks.tx.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 20,
          disabled: false,
          organisationMember: {
            some: { organisationGroupMembers: { some: { group: { teamGroups: { some: { teamId: 1 } } } } } },
          },
        }),
      }),
    );
  });

  it('creates the destination within the transfer transaction when it is missing', async () => {
    mocks.tx.folder.findFirst.mockResolvedValue(null);
    await reassignEnvelopeSender(options);
    expect(mocks.tx.folder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Assigned to you', userId: 20, teamId: 1, parentId: null }),
      }),
    );
    expect(mocks.tx.envelope.updateMany.mock.calls[0][0].data).toEqual({ userId: 20, folderId: 'folder_assigned_new' });
  });

  it('does not change an existing destination folder or its contents', async () => {
    await reassignEnvelopeSender(options);
    expect(mocks.tx.folder.create).not.toHaveBeenCalled();
    expect(mocks.tx.envelope.updateMany.mock.calls[0][0].where.id).toBe(envelope.id);
  });

  it('records actor, previous and new sender and previous folder in a valid audit event', async () => {
    await reassignEnvelopeSender(options);
    const data = mocks.tx.documentAuditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      userId: 1,
      email: 'manager@example.com',
      type: 'DOCUMENT_SENDER_REASSIGNED',
      data: { from: originalOwner, to: newOwner, previousFolderId: 'folder_original' },
    });
    expect(ZDocumentAuditLogSchema.safeParse({ ...data, id: 'audit_test', createdAt: new Date() }).success).toBe(true);
  });

  it('rejects ordinary members even when they own the envelope', async () => {
    mocks.getWhere.mockResolvedValue({
      envelopeWhereInput: { id: envelope.id },
      team: { currentTeamRole: TeamMemberRole.MEMBER },
    });
    await expect(reassignEnvelopeSender(options)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.tx.envelope.updateMany).not.toHaveBeenCalled();
  });

  it('uses the existing visibility predicate and constrains the lookup to the current team and documents', async () => {
    await reassignEnvelopeSender(options);
    expect(mocks.tx.envelope.findFirst.mock.calls[0][0].where).toEqual({
      id: envelope.id,
      teamId: 1,
      type: 'DOCUMENT',
      OR: [{ userId: 1 }, { visibility: 'EVERYONE', teamId: 1 }],
    });
  });

  it('rejects inaccessible envelopes', async () => {
    mocks.tx.envelope.findFirst.mockResolvedValue(null);
    await expect(reassignEnvelopeSender(options)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mocks.tx.envelope.updateMany).not.toHaveBeenCalled();
  });

  it.each([DocumentStatus.REJECTED])('rejects %s envelopes', async (status) => {
    mocks.tx.envelope.findFirst.mockResolvedValue({ ...envelope, status });
    await expect(reassignEnvelopeSender(options)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(mocks.tx.envelope.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    DocumentStatus.DRAFT,
    DocumentStatus.PENDING,
    DocumentStatus.COMPLETED,
  ])('reassigns %s envelopes without changing their lifecycle or signed content', async (status) => {
    const completedAt = status === DocumentStatus.COMPLETED ? new Date('2026-01-01T00:00:00Z') : null;
    mocks.tx.envelope.findFirst.mockResolvedValue({ ...envelope, status, completedAt });
    await reassignEnvelopeSender(options);
    expect(mocks.tx.envelope.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ status, completedAt }),
      data: { userId: 20, folderId: 'folder_assigned' },
    });
  });

  it('rejects deleted completed envelopes', async () => {
    mocks.tx.envelope.findFirst.mockResolvedValue({
      ...envelope,
      status: DocumentStatus.COMPLETED,
      completedAt: new Date(),
      deletedAt: new Date(),
    });
    await expect(reassignEnvelopeSender(options)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(mocks.tx.envelope.updateMany).not.toHaveBeenCalled();
  });

  it.each(['completedAt', 'deletedAt'])('rejects pending envelopes with %s set', async (key) => {
    mocks.tx.envelope.findFirst.mockResolvedValue({ ...envelope, [key]: new Date() });
    await expect(reassignEnvelopeSender(options)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(mocks.tx.envelope.updateMany).not.toHaveBeenCalled();
  });

  it('rejects stale sender confirmation', async () => {
    await expect(reassignEnvelopeSender({ ...options, expectedOwnerId: 99 })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    expect(mocks.tx.envelope.updateMany).not.toHaveBeenCalled();
  });

  it('rejects assigning the envelope to the same sender', async () => {
    await expect(reassignEnvelopeSender({ ...options, newOwnerId: 10 })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    expect(mocks.tx.envelope.updateMany).not.toHaveBeenCalled();
  });

  it('rejects disabled, removed or other-team users when no eligible target matches', async () => {
    mocks.tx.user.findFirst.mockResolvedValue(null);
    await expect(reassignEnvelopeSender(options)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(mocks.tx.envelope.updateMany).not.toHaveBeenCalled();
  });

  it('does not audit a reassignment if ownership, folder, access or lifecycle changed concurrently', async () => {
    mocks.tx.envelope.updateMany.mockResolvedValue({ count: 0 });
    await expect(reassignEnvelopeSender(options)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(mocks.tx.documentAuditLog.create).not.toHaveBeenCalled();
  });

  it('moves an envelope originally in Home into Assigned to you', async () => {
    mocks.tx.envelope.findFirst.mockResolvedValue({ ...envelope, folderId: null });
    await reassignEnvelopeSender(options);
    expect(mocks.tx.envelope.updateMany.mock.calls[0][0].data).toEqual({ userId: 20, folderId: 'folder_assigned' });
  });
});
