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
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('server Rollbar', () => {
  it('does not initialize or report without a private token', async () => {
    vi.stubEnv('NEXT_PRIVATE_ROLLBAR_ACCESS_TOKEN', '');
    const { reportServerError } = await import('./rollbar');

    reportServerError(new Error('Disabled reporting'));

    expect(sdk.create).not.toHaveBeenCalled();
    expect(sdk.error).not.toHaveBeenCalled();
  });

  it('uses the private token and reports an error only once across server hooks', async () => {
    vi.stubEnv('NEXT_PRIVATE_ROLLBAR_ACCESS_TOKEN', 'private-test-token');
    vi.stubEnv('NEXT_PUBLIC_ROLLBAR_ACCESS_TOKEN', 'public-test-token');
    const { reportServerError } = await import('./rollbar');
    const error = new Error('Unexpected failure');

    reportServerError(error);
    reportServerError(error);

    expect(sdk.create).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'private-test-token' }));
    expect(sdk.error).toHaveBeenCalledExactlyOnceWith(error);
  });
});
