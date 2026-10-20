import { createTransport } from 'nodemailer';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MailChannelsTransport } from './mailchannels';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MailChannels transport with Nodemailer', () => {
  it('preserves nested recipients and groups and returns a normalized envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    const transport = createTransport(MailChannelsTransport.makeTransport({}));

    const result = await transport.sendMail({
      from: 'Sender <sender@example.invalid>',
      to: ['one@example.invalid', [{ name: 'Two', address: 'two@example.invalid' }]],
      cc: { name: 'Reviewers', group: [{ address: 'reviewer@example.invalid' }] },
      bcc: { address: 'copy@example.invalid' },
      subject: 'Compatibility test',
      text: 'Test message',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.from).toEqual({ email: 'sender@example.invalid', name: 'Sender' });
    expect(body.personalizations[0]).toMatchObject({
      to: [
        { email: 'one@example.invalid', name: '' },
        { email: 'two@example.invalid', name: 'Two' },
      ],
      cc: [{ email: 'reviewer@example.invalid' }],
      bcc: [{ email: 'copy@example.invalid' }],
    });
    expect(result.envelope.from).toBe('sender@example.invalid');
    expect(result.envelope.to).toEqual([
      'one@example.invalid',
      'two@example.invalid',
      'reviewer@example.invalid',
      'copy@example.invalid',
    ]);
    expect(result.accepted).toEqual(result.envelope.to);
  });

  it('rejects missing senders before contacting the provider', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const transport = createTransport(MailChannelsTransport.makeTransport({}));
    await expect(transport.sendMail({ to: 'recipient@example.invalid', text: 'Test' })).rejects.toThrow(
      'Missing required fields',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propagates provider failures through the Nodemailer callback', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ message: 'Provider unavailable' }, { status: 503 })),
    );
    const transport = createTransport(MailChannelsTransport.makeTransport({}));
    await expect(
      transport.sendMail({
        from: 'sender@example.invalid',
        to: 'recipient@example.invalid',
        text: 'Test',
      }),
    ).rejects.toThrow('MailChannels error: Provider unavailable');
  });

  it.each([
    ['null', 'null'],
    ['missing message', '{"details":"private provider details"}'],
    ['non-string message', '{"message":{"details":"private provider details"}}'],
    ['empty message', '{"message":""}'],
    ['JSON string', '"private provider details"'],
    ['non-JSON body', '<html>private provider details</html>'],
  ])('falls back to HTTP status for %s without exposing the response body', async (_description, body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 502 })));
    const transport = createTransport(MailChannelsTransport.makeTransport({}));

    await expect(
      transport.sendMail({ from: 'sender@example.invalid', to: 'recipient@example.invalid', text: 'Test' }),
    ).rejects.toThrow('MailChannels error: HTTP 502');
  });

  it('propagates network failures through the Nodemailer callback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network unavailable')));
    const transport = createTransport(MailChannelsTransport.makeTransport({}));

    await expect(
      transport.sendMail({ from: 'sender@example.invalid', to: 'recipient@example.invalid', text: 'Test' }),
    ).rejects.toThrow('Network unavailable');
  });
});
