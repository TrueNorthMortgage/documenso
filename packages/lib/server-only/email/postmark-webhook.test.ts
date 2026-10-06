import { Hono } from 'hono';
import type { Logger } from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ process: vi.fn(), secret: 'test-smtp-api-token' }));
vi.mock('@documenso/lib/server-only/email/email-delivery', () => ({ processPostmarkEvent: mocks.process }));
vi.mock('@documenso/lib/utils/env', () => ({
  env: (key: string) => {
    if (key === 'NEXT_PRIVATE_SMTP_PASSWORD') {
      return mocks.secret;
    }
    if (key === 'NEXT_PRIVATE_SMTP_HOST') {
      return 'smtp.postmarkapp.com';
    }
    return undefined;
  },
}));

import { postmarkWebhookRoute } from '../../../../apps/remix/server/api/webhooks/postmark';

const app = new Hono<{ Variables: { logger: Pick<Logger, 'warn' | 'error'> } }>();
app.use('*', async (c, next) => {
  c.set('logger', { warn: vi.fn(), error: vi.fn() });
  await next();
});
app.route('/', postmarkWebhookRoute);

const event = {
  RecordType: 'Delivery',
  MessageStream: 'outbound',
  ServerID: 23,
  MessageID: 'message-1',
  Recipient: 'signer@example.com',
  DeliveredAt: '2026-10-05T12:00:00Z',
};
const authorization = `Basic ${Buffer.from('documenso:test-smtp-api-token').toString('base64')}`;

describe('Postmark webhook endpoint', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.secret = 'test-smtp-api-token';
    mocks.process.mockResolvedValue('MATCHED');
  });

  it('requires Basic Auth with the existing SMTP credential before reading or processing a payload', async () => {
    for (const header of [
      undefined,
      'Basic invalid',
      `Basic ${Buffer.from('documenso:SMTP-credential').toString('base64')}`,
    ]) {
      const response = await app.request('/', {
        method: 'POST',
        headers: header ? { authorization: header } : {},
      });
      expect(response.status).toBe(401);
    }
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it('fails closed when the webhook is not configured', async () => {
    mocks.secret = '';
    const response = await app.request('/', { method: 'POST', headers: { authorization } });
    expect(response.status).toBe(503);
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it('validates JSON and rejects unsupported/malformed events', async () => {
    for (const body of [
      '{',
      JSON.stringify({ ...event, DeliveredAt: 'invalid' }),
      JSON.stringify({ ...event, RecordType: 'Open' }),
    ]) {
      const response = await app.request('/', { method: 'POST', headers: { authorization }, body });
      expect(response.status).toBe(400);
    }
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it('returns a retryable response if durable processing fails', async () => {
    mocks.process.mockRejectedValue(new Error('database unavailable'));
    const response = await app.request('/', {
      method: 'POST',
      headers: { authorization },
      body: JSON.stringify(event),
    });
    expect(response.status).toBe(503);
  });

  it('accepts the Postmark verification sample without tracked signing metadata', async () => {
    mocks.process.mockResolvedValueOnce('UNMATCHED');
    const response = await app.request('/', {
      method: 'POST',
      headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify({
        RecordType: 'Delivery',
        ServerID: 23,
        MessageStream: 'outbound',
        MessageID: '00000000-0000-0000-0000-000000000000',
        Recipient: 'john@example.com',
        Tag: 'welcome-email',
        DeliveredAt: '2026-09-15T11:01:15Z',
        Details: 'Test delivery webhook details',
        Metadata: { example: 'value', example_2: 'value' },
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'UNMATCHED' });
    expect(mocks.process).toHaveBeenCalledExactlyOnceWith({
      eventKey: expect.stringMatching(/^[a-f0-9]{64}$/),
      providerMessageId: '00000000-0000-0000-0000-000000000000',
      serverId: 23,
      messageStream: 'outbound',
      recipientEmail: 'john@example.com',
      attemptId: undefined,
      providerScope: undefined,
      eventType: 'Delivery',
      status: 'DELIVERED',
      occurredAt: new Date('2026-09-15T11:01:15Z'),
      failureCode: null,
    });
  });

  it('accepts the Postmark bounce verification sample and strips email content', async () => {
    mocks.process.mockResolvedValueOnce('UNMATCHED');
    const response = await app.request('/', {
      method: 'POST',
      headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify({
        ID: 42,
        Type: 'HardBounce',
        RecordType: 'Bounce',
        TypeCode: 1,
        Tag: 'Test',
        MessageID: '00000000-0000-0000-0000-000000000000',
        Details: 'Test bounce details',
        Email: 'john@example.com',
        From: 'sender@example.com',
        BouncedAt: '2026-09-15T11:01:15Z',
        Inactive: true,
        DumpAvailable: true,
        CanActivate: true,
        Subject: 'Test subject',
        ServerID: 1234,
        MessageStream: 'outbound',
        Content: 'Test content',
        Name: 'Hard bounce',
        Description: 'The server was unable to deliver your message (ex: unknown user, mailbox not found).',
        Metadata: { example: 'value', example_2: 'value' },
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'UNMATCHED' });
    expect(mocks.process).toHaveBeenCalledExactlyOnceWith({
      eventKey: expect.stringMatching(/^[a-f0-9]{64}$/),
      providerMessageId: '00000000-0000-0000-0000-000000000000',
      serverId: 1234,
      messageStream: 'outbound',
      recipientEmail: 'john@example.com',
      attemptId: undefined,
      providerScope: undefined,
      eventType: 'Bounce',
      status: 'BOUNCED',
      occurredAt: new Date('2026-09-15T11:01:15Z'),
      failureCode: 'HardBounce',
    });
  });

  it('accepts the Postmark spam complaint verification sample and strips email content', async () => {
    mocks.process.mockResolvedValueOnce('UNMATCHED');
    const response = await app.request('/', {
      method: 'POST',
      headers: { authorization, 'content-type': 'application/json' },
      body: JSON.stringify({
        RecordType: 'SpamComplaint',
        ID: 42,
        Type: 'SpamComplaint',
        TypeCode: 100001,
        Tag: 'Test',
        MessageID: '00000000-0000-0000-0000-000000000000',
        Details: 'Test spam complaint details',
        Email: 'john@example.com',
        From: 'sender@example.com',
        BouncedAt: '2026-09-15T11:01:15Z',
        Inactive: true,
        DumpAvailable: true,
        CanActivate: true,
        Subject: 'Test subject',
        ServerID: 1234,
        MessageStream: 'outbound',
        Content: 'Test content',
        Name: 'Spam complaint',
        Description: 'The subscriber explicitly marked this message as spam.',
        Metadata: { example: 'value', example_2: 'value' },
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'UNMATCHED' });
    expect(mocks.process).toHaveBeenCalledExactlyOnceWith({
      eventKey: expect.stringMatching(/^[a-f0-9]{64}$/),
      providerMessageId: '00000000-0000-0000-0000-000000000000',
      serverId: 1234,
      messageStream: 'outbound',
      recipientEmail: 'john@example.com',
      attemptId: undefined,
      providerScope: undefined,
      eventType: 'SpamComplaint',
      status: 'SPAM_COMPLAINT',
      occurredAt: new Date('2026-09-15T11:01:15Z'),
      failureCode: 'SpamComplaint',
    });
  });

  it('acknowledges only after processing resolves and accepts persisted duplicates', async () => {
    for (const outcome of ['MATCHED', 'DUPLICATE', 'UNMATCHED']) {
      mocks.process.mockResolvedValueOnce(outcome);
      const response = await app.request('/', {
        method: 'POST',
        headers: { authorization },
        body: JSON.stringify(event),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: outcome });
    }
  });
});
