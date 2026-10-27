import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  envelope: { findFirst: vi.fn() },
  recipient: { findMany: vi.fn(), updateMany: vi.fn() },
}));

vi.mock('@documenso/prisma', () => ({ prisma: mocks }));

import { recomputeNextReminderForEnvelope, updateRecipientNextReminder } from './update-recipient-next-reminder';

describe('recipient reminder scheduling', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.recipient.updateMany.mockResolvedValue({ count: 0 });
  });

  it('does not reschedule a recipient who opts out while an email is being sent', async () => {
    await updateRecipientNextReminder({
      recipientId: 1,
      envelopeId: 'envelope-1',
      sentAt: new Date(),
      lastReminderSentAt: null,
      reminderSettings: { sendAfter: { unit: 'day', amount: 1 }, repeatEvery: { unit: 'day', amount: 1 } },
    });

    expect(mocks.recipient.updateMany).toHaveBeenCalledWith({
      where: { id: 1, envelopeId: 'envelope-1', notificationsOptedOutAt: null },
      data: { nextReminderAt: expect.any(Date) },
    });
  });

  it('preserves opt-outs when agents change envelope reminder settings', async () => {
    mocks.envelope.findFirst.mockResolvedValue({
      documentMeta: {
        reminderSettings: { sendAfter: { unit: 'day', amount: 1 }, repeatEvery: { unit: 'day', amount: 1 } },
      },
    });
    mocks.recipient.findMany.mockResolvedValue([{ id: 1, sentAt: new Date(), lastReminderSentAt: null }]);

    await recomputeNextReminderForEnvelope('envelope-1');

    expect(mocks.recipient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ notificationsOptedOutAt: null }) }),
    );
    expect(mocks.recipient.updateMany).toHaveBeenCalledWith({
      where: { id: 1, envelopeId: 'envelope-1', notificationsOptedOutAt: null },
      data: { nextReminderAt: expect.any(Date) },
    });
  });
});
