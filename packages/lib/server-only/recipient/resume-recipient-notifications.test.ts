import {
  DocumentDistributionMethod,
  DocumentStatus,
  RecipientRole,
  SendStatus,
  SigningStatus,
  TeamMemberRole,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getWhere: vi.fn(),
  tx: {
    envelope: { findFirst: vi.fn() },
    recipient: { findFirst: vi.fn(), updateMany: vi.fn() },
    documentAuditLog: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

vi.mock('@documenso/prisma', () => ({
  prisma: { $transaction: (callback: (tx: typeof mocks.tx) => unknown) => callback(mocks.tx) },
}));
vi.mock('../envelope/get-envelope-by-id', () => ({ getEnvelopeWhereInput: mocks.getWhere }));

import { ZDocumentAuditLogSchema } from '../../types/document-audit-logs';
import { resumeRecipientNotifications } from './resume-recipient-notifications';

const optedOutAt = new Date('2026-10-26T12:00:00Z');
const auditLog = {
  id: 'opt-out-log',
  envelopeId: 'envelope-1',
  type: 'RECIPIENT_NOTIFICATIONS_OPTED_OUT',
  createdAt: optedOutAt,
  data: {
    recipientId: 1,
    recipientName: 'Recipient',
    recipientEmail: 'recipient@example.com',
    optedOutAt: optedOutAt.toISOString(),
  },
};
const options = {
  envelopeId: 'envelope-1',
  auditLogId: auditLog.id,
  userId: 10,
  teamId: 1,
  requestMetadata: {
    source: 'app',
    auth: 'session',
    requestMetadata: { ipAddress: '127.0.0.1' },
    auditUser: { id: 10, name: 'Manager', email: 'manager@example.com' },
  },
} as const;

describe('resumeRecipientNotifications', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getWhere.mockResolvedValue({
      envelopeWhereInput: { id: 'envelope-1' },
      team: { currentTeamRole: TeamMemberRole.MANAGER },
    });
    mocks.tx.envelope.findFirst.mockResolvedValue({
      id: 'envelope-1',
      documentMeta: {
        distributionMethod: DocumentDistributionMethod.EMAIL,
        reminderSettings: { sendAfter: { unit: 'day', amount: 5 }, repeatEvery: { unit: 'day', amount: 2 } },
      },
    });
    mocks.tx.documentAuditLog.findFirst.mockResolvedValue(auditLog);
    mocks.tx.recipient.findFirst.mockResolvedValue({
      id: 1,
      name: 'Recipient',
      email: 'recipient@example.com',
      sentAt: new Date(),
      lastReminderSentAt: null,
      expiresAt: null,
      sendStatus: SendStatus.SENT,
    });
    mocks.tx.recipient.updateMany.mockResolvedValue({ count: 1 });
  });

  it.each([TeamMemberRole.MANAGER, TeamMemberRole.ADMIN])('allows %s to resume the current opt-out', async (role) => {
    mocks.getWhere.mockResolvedValue({ envelopeWhereInput: { id: 'envelope-1' }, team: { currentTeamRole: role } });

    await resumeRecipientNotifications(options);

    expect(mocks.tx.recipient.updateMany).toHaveBeenCalledWith({
      where: {
        id: 1,
        envelopeId: 'envelope-1',
        notificationsOptedOutAt: optedOutAt,
        signingStatus: SigningStatus.NOT_SIGNED,
        role: { not: RecipientRole.CC },
        envelope: { id: 'envelope-1', teamId: 1, type: 'DOCUMENT', status: DocumentStatus.PENDING, deletedAt: null },
      },
      data: { notificationsOptedOutAt: null, nextReminderAt: expect.any(Date) },
    });
    const entry = mocks.tx.documentAuditLog.create.mock.calls[0][0].data;
    expect(entry).toMatchObject({
      type: 'RECIPIENT_NOTIFICATIONS_RESUMED',
      userId: 10,
      name: 'Manager',
      email: 'manager@example.com',
      ipAddress: '127.0.0.1',
      data: { recipientId: 1, optOutAuditLogId: auditLog.id },
    });
    expect(ZDocumentAuditLogSchema.safeParse({ ...entry, id: 'resume-log', createdAt: new Date() }).success).toBe(true);
  });

  it('forbids ordinary members, including the document owner', async () => {
    mocks.getWhere.mockResolvedValue({
      envelopeWhereInput: { id: 'envelope-1', userId: 10 },
      team: { currentTeamRole: TeamMemberRole.MEMBER },
    });

    await expect(resumeRecipientNotifications(options)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mocks.tx.envelope.findFirst).not.toHaveBeenCalled();
    expect(mocks.tx.recipient.updateMany).not.toHaveBeenCalled();
  });

  it('requires access to an active document in the current team', async () => {
    mocks.tx.envelope.findFirst.mockResolvedValue(null);

    await expect(resumeRecipientNotifications(options)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mocks.tx.envelope.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'envelope-1', teamId: 1, type: 'DOCUMENT', status: DocumentStatus.PENDING, deletedAt: null },
      }),
    );
    expect(mocks.tx.recipient.updateMany).not.toHaveBeenCalled();
  });

  it('rejects logs from another envelope or of another type', async () => {
    mocks.tx.documentAuditLog.findFirst.mockResolvedValue(null);

    await expect(resumeRecipientNotifications(options)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mocks.tx.documentAuditLog.findFirst).toHaveBeenCalledWith({
      where: { id: auditLog.id, envelopeId: 'envelope-1', type: 'RECIPIENT_NOTIFICATIONS_OPTED_OUT' },
    });
    expect(mocks.tx.recipient.updateMany).not.toHaveBeenCalled();
  });

  it('cannot use an old log to override a newer opt-out or a completed recipient', async () => {
    mocks.tx.recipient.findFirst.mockResolvedValue(null);

    await expect(resumeRecipientNotifications(options)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(mocks.tx.recipient.findFirst).toHaveBeenCalledWith({
      where: {
        id: 1,
        envelopeId: 'envelope-1',
        notificationsOptedOutAt: optedOutAt,
        signingStatus: SigningStatus.NOT_SIGNED,
        role: { not: RecipientRole.CC },
      },
    });
    expect(mocks.tx.documentAuditLog.create).not.toHaveBeenCalled();
  });

  it('does not record a second resume when another request has already changed the preference', async () => {
    mocks.tx.recipient.updateMany.mockResolvedValue({ count: 0 });

    await expect(resumeRecipientNotifications(options)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(mocks.tx.documentAuditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    'disabled',
    'manual',
    'expired',
    'unsent',
  ])('does not schedule automatic reminders when %s', async (scenario) => {
    const envelope = await mocks.tx.envelope.findFirst();
    const recipient = await mocks.tx.recipient.findFirst();
    if (scenario === 'disabled') {
      envelope.documentMeta.reminderSettings = null;
    }
    if (scenario === 'manual') {
      envelope.documentMeta.distributionMethod = DocumentDistributionMethod.NONE;
    }
    if (scenario === 'expired') {
      recipient.expiresAt = new Date(0);
    }
    if (scenario === 'unsent') {
      recipient.sendStatus = SendStatus.NOT_SENT;
    }
    mocks.tx.envelope.findFirst.mockResolvedValue(envelope);
    mocks.tx.recipient.findFirst.mockResolvedValue(recipient);

    await resumeRecipientNotifications(options);

    expect(mocks.tx.recipient.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { notificationsOptedOutAt: null, nextReminderAt: null },
      }),
    );
  });

  it('fails the transaction if the resume audit log cannot be saved', async () => {
    mocks.tx.documentAuditLog.create.mockRejectedValue(new Error('Audit write failed'));
    await expect(resumeRecipientNotifications(options)).rejects.toThrow('Audit write failed');
  });
});
