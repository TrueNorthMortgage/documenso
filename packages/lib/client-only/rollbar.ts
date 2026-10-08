import Rollbar from 'rollbar';

import { getRollbarConfiguration } from '../universal/rollbar';
import { env } from '../utils/env';

let browserRollbar: Rollbar | undefined;

export const initializeBrowserRollbar = () => {
  const accessToken = env('NEXT_PUBLIC_ROLLBAR_ACCESS_TOKEN');

  if (typeof window === 'undefined' || !accessToken || browserRollbar) {
    return;
  }

  browserRollbar = new Rollbar({ ...getRollbarConfiguration(), accessToken });
};

export const reportBrowserError = (error: unknown) => {
  if (error instanceof Error) {
    browserRollbar?.error(error);
  }
};

export const reportBrowserHydrationError = (error: unknown, info: { componentStack?: string }) => {
  if (error instanceof Error && info.componentStack) {
    // Component frames identify the failing UI without collecting route URLs or props.
    error.stack = `${error.stack ?? `${error.name}: ${error.message}`}\n${info.componentStack}`;
  }

  reportBrowserError(error);
  console.error(error);
};
