import { env } from '@documenso/lib/utils/env';
import type { SentMessageInfo, Transport } from 'nodemailer';
import addressparser from 'nodemailer/lib/addressparser';
import type MailMessage from 'nodemailer/lib/mailer/mail-message';

const VERSION = '1.0.0';

type NodeMailerAddress = MailMessage['data']['to'];

interface MailChannelsAddress {
  email: string;
  name?: string;
}

interface MailChannelsTransportOptions {
  apiKey: string;
  endpoint: string;
}

/**
 * Transport for sending email through MailChannels via Cloudflare Workers.
 *
 * Optionally allows specifying a custom endpoint and API key so you can setup a worker
 * to proxy requests to MailChannels with added security.
 *
 * @see https://blog.cloudflare.com/sending-email-from-workers-with-mailchannels/
 */
export class MailChannelsTransport implements Transport<SentMessageInfo> {
  public name = 'CloudflareMailTransport';
  public version = VERSION;

  private _options: MailChannelsTransportOptions;

  public static makeTransport(options: Partial<MailChannelsTransportOptions>) {
    return new MailChannelsTransport(options);
  }

  constructor(options: Partial<MailChannelsTransportOptions>) {
    const { apiKey = '', endpoint = 'https://api.mailchannels.net/tx/v1/send' } = options;

    this._options = {
      apiKey,
      endpoint,
    };
  }

  public send(mail: MailMessage, callback: Parameters<Transport<SentMessageInfo>['send']>[1]) {
    if (!mail.data.to || !mail.data.from) {
      return callback(new Error('Missing required fields "to" or "from"'));
    }

    const mailTo = this.toMailChannelsAddresses(mail.data.to);
    const mailCc = this.toMailChannelsAddresses(mail.data.cc);
    const mailBcc = this.toMailChannelsAddresses(mail.data.bcc);

    const [from] = this.toMailChannelsAddresses(mail.data.from);

    if (!from) {
      return callback(new Error('Missing required field "from"'));
    }

    const envelope = {
      from: from.email,
      to: [...mailTo, ...mailCc, ...mailBcc].map((recipient) => recipient.email),
    };

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this._options.apiKey) {
      requestHeaders['X-Auth-Token'] = this._options.apiKey;
    }

    return fetch(this._options.endpoint, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({
        from: from,
        subject: mail.data.subject,
        personalizations: [
          {
            to: mailTo,
            cc: mailCc.length > 0 ? mailCc : undefined,
            bcc: mailBcc.length > 0 ? mailBcc : undefined,
            dkim_domain: env('NEXT_PRIVATE_MAILCHANNELS_DKIM_DOMAIN') || undefined,
            dkim_selector: env('NEXT_PRIVATE_MAILCHANNELS_DKIM_SELECTOR') || undefined,
            dkim_private_key: env('NEXT_PRIVATE_MAILCHANNELS_DKIM_PRIVATE_KEY') || undefined,
          },
        ],
        content: [
          {
            type: 'text/plain',
            value: mail.data.text?.toString('utf-8') ?? '',
          },
          {
            type: 'text/html',
            value: mail.data.html?.toString('utf-8') ?? '',
          },
        ],
      }),
    })
      .then(async (res) => {
        if (res.status >= 200 && res.status <= 299) {
          return callback(null, {
            messageId: '',
            envelope,
            accepted: envelope.to,
            rejected: [],
            pending: [],
          });
        }

        const data: unknown = await res.json().catch(() => null);
        const message =
          data !== null && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
            ? data.message
            : '';

        return callback(new Error(`MailChannels error: ${message || `HTTP ${res.status}`}`));
      })
      .catch((err) => {
        return callback(err);
      });
  }

  /**
   * Converts a nodemailer address(s) to an array of MailChannel compatible address.
   */
  private toMailChannelsAddresses(address: NodeMailerAddress): Array<MailChannelsAddress> {
    if (!address) {
      return [];
    }

    if (typeof address === 'string') {
      return this.toMailChannelsAddresses(addressparser(address, { flatten: true }));
    }

    if (Array.isArray(address)) {
      return address.flatMap((entry) => this.toMailChannelsAddresses(entry));
    }

    if (address.group) {
      return this.toMailChannelsAddresses(address.group);
    }

    if (!address.address) {
      return [];
    }

    return [
      {
        email: address.address,
        name: address.name,
      },
    ];
  }
}
