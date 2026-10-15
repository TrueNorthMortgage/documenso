import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { reportBrowserError } from '../rollbar';
import { refreshSessionInBackground } from './refresh-session-in-background';

vi.mock('../rollbar', () => ({ reportBrowserError: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('background session refresh', () => {
  it('refreshes the session normally when the request succeeds', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);

    await refreshSessionInBackground(refresh);

    expect(refresh).toHaveBeenCalledOnce();
    expect(reportBrowserError).not.toHaveBeenCalled();
  });

  it.each([
    new TypeError('Failed to fetch'),
    new TypeError('NetworkError when attempting to fetch resource.'),
    new TypeError('Load failed'),
    new TypeError('Network request failed'),
    new DOMException('The operation was aborted.', 'AbortError'),
  ])('handles transient fetch failures without reporting them: %s', async (error) => {
    await expect(refreshSessionInBackground(() => Promise.reject(error))).resolves.toBeUndefined();

    expect(reportBrowserError).not.toHaveBeenCalled();
  });

  it.each([
    new TypeError('Cannot read properties of undefined'),
    new AppError(AppErrorCode.UNKNOWN_ERROR, { message: 'Session endpoint failed', statusCode: 500 }),
    new Error('Failed to fetch document contents'),
  ])('still reports unexpected failures with their original stack: %s', async (error) => {
    await expect(refreshSessionInBackground(() => Promise.reject(error))).resolves.toBeUndefined();

    expect(reportBrowserError).toHaveBeenCalledExactlyOnceWith(error);
  });

  it('reports non-Error rejections as application errors', async () => {
    await refreshSessionInBackground(() => Promise.reject(null));

    expect(reportBrowserError).toHaveBeenCalledExactlyOnceWith(expect.any(AppError));
  });
});
