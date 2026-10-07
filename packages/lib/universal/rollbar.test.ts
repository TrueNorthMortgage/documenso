import Rollbar from 'rollbar';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPublicEnv } from '../utils/env';
import { getRollbarConfiguration, sanitizeRollbarPayload } from './rollbar';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Rollbar configuration', () => {
  it('exposes only the browser token in public environment configuration', () => {
    vi.stubEnv('NEXT_PRIVATE_ROLLBAR_ACCESS_TOKEN', 'private-test-token');
    vi.stubEnv('NEXT_PUBLIC_ROLLBAR_ACCESS_TOKEN', 'public-test-token');

    const publicEnv = createPublicEnv();

    expect(publicEnv.NEXT_PUBLIC_ROLLBAR_ACCESS_TOKEN).toBe('public-test-token');
    expect(JSON.stringify(publicEnv)).not.toContain('private-test-token');
  });

  it('uses the configured deployment environment and version', () => {
    vi.stubEnv('NEXT_PUBLIC_ROLLBAR_ENVIRONMENT', 'staging');
    vi.stubEnv('NEXT_PUBLIC_ROLLBAR_CODE_VERSION', 'test-release');

    expect(getRollbarConfiguration()).toMatchObject({
      environment: 'staging',
      codeVersion: 'test-release',
      payload: { client: { javascript: { code_version: 'test-release' } } },
    });
  });

  it('shares the server environment fallback with the browser', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_ROLLBAR_ENVIRONMENT', '');

    expect(createPublicEnv().NEXT_PUBLIC_ROLLBAR_ENVIRONMENT).toBe('production');
    expect(getRollbarConfiguration().environment).toBe('production');
  });

  it('removes request, person, custom data, and telemetry while retaining diagnostic frames', () => {
    const payload = {
      request: { url: '/sign/secret-token', body: 'document contents', headers: { cookie: 'secret' } },
      person: { email: 'signer@example.com' },
      custom: { document: 'document contents' },
      context: '/sign/secret-token',
      body: {
        trace: {
          exception: { class: 'Error', message: 'Unexpected failure' },
          frames: [{ filename: 'app.js', lineno: 42 }],
        },
        telemetry: [{ body: 'document contents' }],
      },
    };

    sanitizeRollbarPayload(payload);

    expect(JSON.stringify(payload)).not.toMatch(/secret|signer@example.com|document contents/);
    expect(payload.body.trace.frames).toEqual([{ filename: 'app.js', lineno: 42 }]);
  });

  it('produces a sanitized error report using the official Node SDK without transmitting it', async () => {
    let report: Rollbar.Dictionary | undefined;
    const configuration = getRollbarConfiguration();
    const rollbar = new Rollbar({
      ...configuration,
      accessToken: 'test-token',
      captureUncaught: false,
      captureUnhandledRejections: false,
      transmit: false,
      onSendCallback: (_isUncaught, _args, payload) => {
        configuration.onSendCallback?.(_isUncaught, _args, payload);
        report = payload;
      },
    });

    rollbar.error(new Error('SDK verification'), {
      url: '/sign/secret-token',
      body: 'document contents',
      headers: { authorization: 'secret' },
    });
    await new Promise<void>((resolve) => rollbar.wait(resolve));

    expect(report).toBeDefined();
    expect(JSON.stringify(report)).toContain('SDK verification');
    expect(JSON.stringify(report)).not.toMatch(/secret-token|document contents|authorization/);
  });
});
