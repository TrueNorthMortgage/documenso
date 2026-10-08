import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => {
  const error = vi.fn();
  return {
    error,
    create: vi.fn(function (this: { error: typeof error }) {
      this.error = error;
    }),
  };
});

vi.mock('rollbar', () => ({ default: sdk.create }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal('window', {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('browser Rollbar', () => {
  it('does not initialize or report without a public token', async () => {
    vi.stubEnv('NEXT_PUBLIC_ROLLBAR_ACCESS_TOKEN', '');
    const { initializeBrowserRollbar, reportBrowserError } = await import('./rollbar');

    initializeBrowserRollbar();
    reportBrowserError(new Error('Disabled reporting'));

    expect(sdk.create).not.toHaveBeenCalled();
    expect(sdk.error).not.toHaveBeenCalled();
  });

  it('initializes once using only the public token and reports router errors', async () => {
    vi.stubEnv('NEXT_PRIVATE_ROLLBAR_ACCESS_TOKEN', 'private-test-token');
    vi.stubEnv('NEXT_PUBLIC_ROLLBAR_ACCESS_TOKEN', 'public-test-token');
    const { initializeBrowserRollbar, reportBrowserError } = await import('./rollbar');
    const error = new Error('Unexpected failure');

    initializeBrowserRollbar();
    initializeBrowserRollbar();
    reportBrowserError(error);

    expect(sdk.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ accessToken: 'public-test-token' }));
    expect(sdk.error).toHaveBeenCalledExactlyOnceWith(error);
  });

  it('includes React component frames in recoverable hydration reports', async () => {
    vi.stubEnv('NEXT_PUBLIC_ROLLBAR_ACCESS_TOKEN', 'public-test-token');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { initializeBrowserRollbar, reportBrowserHydrationError } = await import('./rollbar');
    initializeBrowserRollbar();
    const error = new Error('Hydration failed');
    const componentStack = '\n    at SigningPage (https://app.example/assets/signing.js:1:20)';

    reportBrowserHydrationError(error, { componentStack });

    expect(error.stack).toContain(componentStack);
    expect(sdk.error).toHaveBeenCalledExactlyOnceWith(error);
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(error);
  });

  it('keeps hydration errors visible when Rollbar is disabled', async () => {
    vi.stubEnv('NEXT_PUBLIC_ROLLBAR_ACCESS_TOKEN', '');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { reportBrowserHydrationError } = await import('./rollbar');
    const error = new Error('Hydration failed');
    reportBrowserHydrationError(error, {});

    expect(sdk.error).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledExactlyOnceWith(error);
  });
});
