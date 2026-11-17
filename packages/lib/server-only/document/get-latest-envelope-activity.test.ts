import { EmailDeliveryStatus, RecipientRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DOCUMENT_AUDIT_LOG_TYPE } from '../../types/document-audit-logs';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  count: vi.fn(),
  groupBy: vi.fn(),
  getTeamById: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({
  prisma: { documentAuditLog: { findMany: mocks.findMany, count: mocks.count, groupBy: mocks.groupBy } },
}));
vi.mock('../team/get-team', () => ({ getTeamById: mocks.getTeamById }));

import { getEnvelopeActivityNotifications, getLatestEnvelopeActivity } from './get-latest-envelope-activity';

const owner = { userId: 12, userEmail: 'owner@example.com', teamId: 3 };
const recipientData = {
  recipientEmail: 'signer@example.com',
  recipientName: 'Signer',
  recipientId: 22,
  recipientRole: RecipientRole.SIGNER,
};
const options = {
  ...owner,
  page: 1,
  perPage: 10,
  period: 'day' as const,
  query: '',
  unreadOnly: false,
  readIds: [],
};

describe('latest envelope activity', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getTeamById.mockResolvedValue({ id: owner.teamId });
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(1);
    mocks.groupBy.mockResolvedValue([]);
  });

  it.each([
    {
      name: 'another recipient signing',
      type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_RECIPIENT_COMPLETED,
      data: { ...recipientData, actionAuth: [] },
      actor: 'signer@example.com',
      notification: true,
    },
    {
      name: 'the owner signing with differently cased email',
      type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_RECIPIENT_COMPLETED,
      data: { ...recipientData, actionAuth: [] },
      actor: 'OWNER@EXAMPLE.COM',
      notification: false,
    },
    {
      name: 'the final envelope completion',
      type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_COMPLETED,
      data: { transactionId: 'transaction' },
      actor: null,
      notification: false,
    },
    {
      name: 'sending an envelope',
      type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_SENT,
      data: {},
      actor: owner.userEmail,
      notification: false,
    },
    {
      name: 'an automated reminder',
      type: DOCUMENT_AUDIT_LOG_TYPE.EMAIL_SENT,
      data: { ...recipientData, emailType: 'REMINDER', isResending: false },
      actor: null,
      notification: false,
    },
    {
      name: 'a manual reminder',
      type: DOCUMENT_AUDIT_LOG_TYPE.EMAIL_SENT,
      data: { ...recipientData, emailType: 'SIGNING_REQUEST', isResending: true },
      actor: owner.userEmail,
      notification: false,
    },
    {
      name: 'an envelope open',
      type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_OPENED,
      data: { ...recipientData, accessAuth: [] },
      actor: 'signer@example.com',
      notification: false,
    },
    {
      name: 'a preview open',
      type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_PREVIEW_OPENED,
      data: {},
      actor: null,
      notification: false,
    },
    {
      name: 'a recipient declining',
      type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_RECIPIENT_REJECTED,
      data: { ...recipientData, reason: 'Declined' },
      actor: 'signer@example.com',
      notification: true,
    },
    {
      name: 'the owner declining',
      type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_RECIPIENT_REJECTED,
      data: { ...recipientData, reason: 'Declined' },
      actor: owner.userEmail,
      notification: false,
    },
    ...[
      DOCUMENT_AUDIT_LOG_TYPE.EMAIL_DELIVERY_UPDATED,
      DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_PREVIEW_EMAIL_DELIVERY_UPDATED,
    ].flatMap((type) =>
      [
        EmailDeliveryStatus.BOUNCED,
        EmailDeliveryStatus.BLOCKED,
        EmailDeliveryStatus.SPAM_COMPLAINT,
        EmailDeliveryStatus.SEND_FAILED,
      ].map((status) => ({
        name: `${type} ${status}`,
        type,
        data: {
          ...recipientData,
          status,
          attemptId: 'attempt',
          occurredAt: '2026-01-01T00:00:00.000Z',
          failureCode: null,
        },
        actor: null,
        notification: true,
      })),
    ),
  ])('classifies $name without confusing history and notifications', async ({ type, data, actor, notification }) => {
    mocks.findMany.mockResolvedValue([
      {
        id: 'event',
        envelopeId: 'envelope',
        createdAt: new Date(),
        type,
        data,
        name: null,
        email: actor,
        userId: null,
        envelope: { title: 'Envelope' },
      },
    ]);

    const result = await getLatestEnvelopeActivity(options);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ isNotification: notification, auditLog: { id: 'event', type } });
  });

  it('recognizes a self-action by user ID even if its actor email is missing', async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: 'self-event',
        envelopeId: 'envelope',
        createdAt: new Date(),
        type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_RECIPIENT_COMPLETED,
        data: { ...recipientData, actionAuth: [] },
        name: null,
        email: null,
        userId: owner.userId,
        envelope: { title: 'Envelope' },
      },
    ]);

    expect((await getLatestEnvelopeActivity(options)).items[0].isNotification).toBe(false);
  });

  it.each(['feed', 'badge'])('rejects inaccessible teams before querying the %s', async (target) => {
    const error = new Error('Team not found');
    mocks.getTeamById.mockRejectedValue(error);

    await expect(
      target === 'feed' ? getLatestEnvelopeActivity(options) : getEnvelopeActivityNotifications(owner),
    ).rejects.toBe(error);
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.count).not.toHaveBeenCalled();
    expect(mocks.groupBy).not.toHaveBeenCalled();
  });
});
