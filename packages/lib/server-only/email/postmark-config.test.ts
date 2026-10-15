import { beforeEach, describe, expect, it, vi } from 'vitest';

const settings = vi.hoisted(() => new Map<string, string>());
vi.mock('../../utils/env', () => ({ env: (key: string) => settings.get(key) }));

import { getPostmarkWebhookSecret } from './postmark-config';

describe('existing Postmark SMTP configuration', () => {
  beforeEach(() => {
    settings.clear();
    settings.set('NEXT_PRIVATE_SMTP_HOST', 'smtp.postmarkapp.com');
    settings.set('NEXT_PRIVATE_SMTP_USERNAME', 'server-api-token');
    settings.set('NEXT_PRIVATE_SMTP_PASSWORD', 'server-api-token');
  });

  it('uses the existing password without a new environment variable', () => {
    expect(getPostmarkWebhookSecret()).toBe('server-api-token');
  });

  it('uses the configured API credential for the existing smtp-api transport', () => {
    settings.set('NEXT_PRIVATE_SMTP_TRANSPORT', 'smtp-api');
    settings.set('NEXT_PRIVATE_SMTP_APIKEY', 'smtp-api-credential');
    expect(getPostmarkWebhookSecret()).toBe('smtp-api-credential');
  });

  it.each([
    'smtp.example.com',
    'smtp.postmarkapp.com.other.example',
  ])('does not enable Postmark hooks for %s', (host) => {
    settings.set('NEXT_PRIVATE_SMTP_HOST', host);
    expect(getPostmarkWebhookSecret()).toBeUndefined();
  });

  it('does not enable Postmark hooks for another transport or an overriding SMTP service', () => {
    settings.set('NEXT_PRIVATE_SMTP_TRANSPORT', 'resend');
    expect(getPostmarkWebhookSecret()).toBeUndefined();
    settings.delete('NEXT_PRIVATE_SMTP_TRANSPORT');
    settings.set('NEXT_PRIVATE_SMTP_SERVICE', 'gmail');
    expect(getPostmarkWebhookSecret()).toBeUndefined();
  });
});
