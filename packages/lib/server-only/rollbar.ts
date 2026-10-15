import Rollbar from 'rollbar';

import { getRollbarConfiguration } from '../universal/rollbar';
import { env } from '../utils/env';

const accessToken = env('NEXT_PRIVATE_ROLLBAR_ACCESS_TOKEN');

export const serverRollbar = accessToken
  ? new Rollbar({
      ...getRollbarConfiguration(),
      accessToken,
      // Preserve Node's fatal-error behavior after reporting an uncaught exception.
      exitOnUncaughtException: true,
    })
  : undefined;

const reportedErrors = new WeakSet<Error>();

export const reportServerError = (error: unknown) => {
  if (!serverRollbar || !(error instanceof Error) || reportedErrors.has(error)) {
    return;
  }

  reportedErrors.add(error);
  serverRollbar.error(error);
};
