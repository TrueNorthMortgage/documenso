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

let sessionValues: Map<string, string>;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  sessionValues = new Map();
  vi.stubGlobal('window', {
    sessionStorage: {
      getItem: vi.fn((key: string) => sessionValues.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => sessionValues.set(key, value)),
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('browser Rollbar', () => {
  it('reports an identical hydration failure once while keeping every console error visible', async () => {
    vi.stubEnv('NEXT_PUBLIC_ROLLBAR_ACCESS_TOKEN', 'public-test-token');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { initializeBrowserRollbar, reportBrowserHydrationError } = await import('./rollbar');
    initializeBrowserRollbar();
    const componentStack = '\n    at SigningPage (app.js:1:20)';
    const firstError = new Error('Hydration failed');

    for (let i = 0; i < 80; i++) {
      reportBrowserHydrationError(i === 0 ? firstError : new Error('Hydration failed'), { componentStack });
    }
    reportBrowserHydrationError(firstError, { componentStack });

    expect(sdk.error).toHaveBeenCalledExactlyOnceWith(firstError);
    expect(consoleError).toHaveBeenCalledTimes(81);
    expect(firstError.stack?.split(componentStack)).toHaveLength(2);
  });

  it('keeps distinct component failures and ordinary router errors reportable', async () => {
    vi.stubEnv('NEXT_PUBLIC_ROLLBAR_ACCESS_TOKEN', 'public-test-token');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { initializeBrowserRollbar, reportBrowserHydrationError, reportBrowserError } = await import('./rollbar');
    initializeBrowserRollbar();
    reportBrowserHydrationError(new Error('Hydration failed'), { componentStack: '\n    at SigningPage' });
    reportBrowserHydrationError(new Error('Hydration failed'), { componentStack: '\n    at SigningDialog' });
    reportBrowserHydrationError(new Error('Text content does not match'), { componentStack: '\n    at SigningPage' });
    reportBrowserError(new Error('Hydration failed'));
    reportBrowserError(new Error('Hydration failed'));

    expect(sdk.error).toHaveBeenCalledTimes(5);
  });

  it('bounds the cache while continuing to report new distinct failures', async () => {
    vi.stubEnv('NEXT_PUBLIC_ROLLBAR_ACCESS_TOKEN', 'public-test-token');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { initializeBrowserRollbar, reportBrowserHydrationError } = await import('./rollbar');
    initializeBrowserRollbar();
    for (let i = 0; i <= 100; i++) {
      reportBrowserHydrationError(new Error(`Hydration failed ${i}`), {});
    }
    reportBrowserHydrationError(new Error('Hydration failed 100'), {});
    reportBrowserHydrationError(new Error('Hydration failed 0'), {});

    expect(sdk.error).toHaveBeenCalledTimes(102);
  });

  it('suppresses repeats after a refresh and reports again for a new tab session', async () => {
    vi.stubEnv('NEXT_PUBLIC_ROLLBAR_ACCESS_TOKEN', 'public-test-token');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const firstPage = await import('./rollbar');
    firstPage.initializeBrowserRollbar();
    firstPage.reportBrowserHydrationError(new Error('Hydration failed'), {});
    vi.resetModules();
    const nextPage = await import('./rollbar');
    nextPage.initializeBrowserRollbar();
    nextPage.reportBrowserHydrationError(new Error('Hydration failed'), {});

    expect(sdk.error).toHaveBeenCalledTimes(1);

    sessionValues.clear();
    vi.resetModules();
    const newSession = await import('./rollbar');
    newSession.initializeBrowserRollbar();
    newSession.reportBrowserHydrationError(new Error('Hydration failed'), {});

    expect(sdk.error).toHaveBeenCalledTimes(2);
  });

  it('reports the same failure again after the deployed code version changes', async () => {
    vi.stubEnv('NEXT_PUBLIC_ROLLBAR_ACCESS_TOKEN', 'public-test-token');
    vi.stubEnv('NEXT_PUBLIC_ROLLBAR_CODE_VERSION', 'release-one');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const firstRelease = await import('./rollbar');
    firstRelease.initializeBrowserRollbar();
    firstRelease.reportBrowserHydrationError(new Error('Hydration failed'), {});

    vi.stubEnv('NEXT_PUBLIC_ROLLBAR_CODE_VERSION', 'release-two');
    vi.resetModules();
    const nextRelease = await import('./rollbar');
    nextRelease.initializeBrowserRollbar();
    nextRelease.reportBrowserHydrationError(new Error('Hydration failed'), {});

    expect(sdk.error).toHaveBeenCalledTimes(2);
  });

  it.each(['blocked', 'invalid'])('keeps reporting and page deduplication with %s storage', async (mode) => {
    vi.stubEnv('NEXT_PUBLIC_ROLLBAR_ACCESS_TOKEN', 'public-test-token');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    if (mode === 'blocked') {
      vi.spyOn(window.sessionStorage, 'getItem').mockImplementation(() => {
        throw new Error('Storage blocked');
      });
      vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(() => {
        throw new Error('Storage blocked');
      });
    } else {
      sessionValues.set('documenso:reported-hydration-errors', '{invalid json');
    }
    const { initializeBrowserRollbar, reportBrowserHydrationError } = await import('./rollbar');
    initializeBrowserRollbar();
    reportBrowserHydrationError(new Error('Hydration failed'), {});
    reportBrowserHydrationError(new Error('Hydration failed'), {});

    expect(sdk.error).toHaveBeenCalledTimes(1);
  });

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

  it('passes only approved hydration context alongside component frames', async () => {
    vi.stubEnv('NEXT_PUBLIC_ROLLBAR_ACCESS_TOKEN', 'public-test-token');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { initializeBrowserRollbar, reportBrowserHydrationError } = await import('./rollbar');
    initializeBrowserRollbar();
    const error = new Error('Hydration failed');
    const hydration = {
      routeId: 'routes/_authenticated+/documents._index',
      requestId: '7549bab8-df86-4543-963c-6c5619435366',
      serverLanguage: 'en',
      clientLanguage: 'en',
      serverTheme: 'system',
      documentTheme: 'dark',
      preferredColorScheme: 'dark',
      documentNodes: 'doctype,html',
      headNodes: 'meta',
      bodyNodes: 'div',
    };

    reportBrowserHydrationError(
      error,
      { componentStack: '\n    at DocumentsPage (app.js:1:20)\n    at https://app.example/assets.js:1:20' },
      {
        ...hydration,
        document: 'private document',
      },
    );

    expect(error.stack).toContain('DocumentsPage');
    expect(sdk.error).toHaveBeenCalledExactlyOnceWith(error, {
      hydration: { ...hydration, componentNames: 'DocumentsPage', mismatchKind: 'structure' },
    });

    reportBrowserHydrationError(
      new Error('Hydration failed'),
      { componentStack: '\n    at DocumentsPage (app.js:1:20)\n    at https://app.example/assets.js:1:20' },
      { ...hydration, document: 'different private contents' },
    );
    expect(sdk.error).toHaveBeenCalledTimes(1);

    reportBrowserHydrationError(
      new Error('Hydration failed'),
      { componentStack: '\n    at DocumentsPage (app.js:1:20)\n    at https://app.example/assets.js:1:20' },
      { ...hydration, requestId: 'a858b508-05d0-481a-b0ca-239dcf7d292b' },
    );
    expect(sdk.error).toHaveBeenCalledTimes(1);

    reportBrowserHydrationError(
      new Error('Hydration failed'),
      { componentStack: '\n    at DocumentsPage (app.js:1:20)' },
      { ...hydration, routeId: 'routes/_recipient+/sign.$token+/_index' },
    );
    expect(sdk.error).toHaveBeenCalledTimes(2);
    expect([...sessionValues.values()].join()).not.toContain(hydration.requestId);
    expect([...sessionValues.values()].join()).not.toContain('https://app.example');
  });

  it('reports the detected field mismatch as the cause without sending private values', async () => {
    vi.stubEnv('NEXT_PUBLIC_ROLLBAR_ACCESS_TOKEN', 'public-test-token');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { initializeBrowserRollbar, reportBrowserHydrationError } = await import('./rollbar');
    const { captureHydrationDiagnostics } = await import('./hydration-diagnostics');
    initializeBrowserRollbar();
    const html = {
      lang: 'en',
      getAttribute: () => null,
    };
    const document = {
      documentElement: html,
      childNodes: [],
      head: null,
      body: null,
      querySelector: () => null,
    } as unknown as Document;
    const diagnostics = {
      ...captureHydrationDiagnostics(document, false),
      clientLanguage: 'en',
      mismatchedDateFields: 'updatedAt',
      document: 'private content',
    };
    reportBrowserHydrationError(new Error('Text content does not match server-rendered HTML.'), {}, diagnostics);
    expect(sdk.error).toHaveBeenCalledWith(expect.any(Error), {
      hydration: expect.objectContaining({ mismatchKind: 'formatted-date', mismatchedDateFields: 'updatedAt' }),
    });
    expect(JSON.stringify(sdk.error.mock.calls)).not.toContain('private content');
  });
});
