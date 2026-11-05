import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recordRecentEmailMessage } from './record-recent-email-message';

const { upsert } = vi.hoisted(() => ({ upsert: vi.fn() }));

vi.mock('@documenso/prisma', () => ({ prisma: { emailMessage: { upsert } } }));

const message = {
  teamId: 1,
  userId: 2,
  subject: 'Please sign {document.name}',
  message: 'Hi {signer.name}, please sign.',
};

describe('recordRecentEmailMessage', () => {
  beforeEach(() => {
    upsert.mockClear();
  });

  it('skips sends that use only default wording', async () => {
    await recordRecentEmailMessage({ ...message, subject: '', message: '  ' });

    expect(upsert).not.toHaveBeenCalled();
  });

  it('keeps the original placeholders and reuses the entry for repeated sends', async () => {
    await recordRecentEmailMessage(message);
    await recordRecentEmailMessage(message);

    const [firstCall, secondCall] = upsert.mock.calls;

    expect(firstCall[0].create).toMatchObject({
      teamId: message.teamId,
      ownerId: message.userId,
      subject: message.subject,
      message: message.message,
      lastSentAt: expect.any(Date),
    });
    expect(secondCall[0].where).toEqual(firstCall[0].where);
    expect(secondCall[0].update).toEqual({ lastSentAt: expect.any(Date) });
  });

  it('keeps identical wording separate across senders and teams', async () => {
    await recordRecentEmailMessage(message);
    await recordRecentEmailMessage({ ...message, userId: 3 });
    await recordRecentEmailMessage({ ...message, teamId: 4 });

    const ids = upsert.mock.calls.map(([options]) => options.where.id);

    expect(new Set(ids).size).toBe(3);
  });
});
