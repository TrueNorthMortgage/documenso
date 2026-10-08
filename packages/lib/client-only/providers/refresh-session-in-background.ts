import { AppError } from '../../errors/app-error';
import { reportBrowserError } from '../rollbar';

export const refreshSessionInBackground = async (refreshSession: () => Promise<void>) => {
  try {
    await refreshSession();
  } catch (cause) {
    const error = AppError.parseError(cause ?? {});

    // Offline connections and page teardown must not become unhandled rejections.
    // Keep the last known session until a later refresh succeeds.
    if (
      cause instanceof Error &&
      (cause.name === 'AbortError' ||
        (cause instanceof TypeError &&
          [
            'Failed to fetch',
            'NetworkError when attempting to fetch resource.',
            'Load failed',
            'Network request failed',
          ].includes(cause.message)))
    ) {
      return;
    }

    reportBrowserError(cause instanceof Error ? cause : error);
  }
};
