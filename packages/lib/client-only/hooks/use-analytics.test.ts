import { afterEach, expect, it, vi } from 'vitest';

import { action, loader } from '../../../../apps/remix/app/routes/_redirects+/ingest.$';
import { useAnalytics } from './use-analytics';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('does not throw, reject, or send analytics with legacy settings supplied', async () => {
  vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'test-key');
  vi.stubEnv('NEXT_PRIVATE_TELEMETRY_KEY', 'test-key');
  vi.stubEnv('NEXT_PRIVATE_TELEMETRY_HOST', 'https://example.invalid');
  vi.stubEnv('DOCUMENSO_DISABLE_TELEMETRY', '');
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  const analytics = useAnalytics();
  expect(analytics.capture('test', { value: 'private' })).toBeUndefined();
  expect(analytics.captureException(new Error('private'))).toBeUndefined();
  expect(analytics.startSessionRecording('test')).toBeUndefined();
  expect(analytics.stopSessionRecording()).toBeUndefined();

  // No deferred SDK import or reporting rejection should run after the call returns.
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(fetchMock).not.toHaveBeenCalled();
});

it('rejects legacy analytics requests locally without contacting PostHog', () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  expect(loader().status).toBe(404);
  expect(action().status).toBe(404);
  expect(fetchMock).not.toHaveBeenCalled();
});
