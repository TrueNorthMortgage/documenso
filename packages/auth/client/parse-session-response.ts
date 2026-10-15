import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import superjson from 'superjson';

import type { SessionValidationResult } from '../server/lib/session/session';

export const parseSessionResponse = async (response: Response): Promise<SessionValidationResult> => {
  const result = await response.json().catch((cause: unknown) => {
    if (cause instanceof SyntaxError) {
      // Never include response contents: a proxy error page may contain sensitive data.
      throw new AppError(AppErrorCode.UNKNOWN_ERROR, {
        message: `Session endpoint returned invalid JSON (HTTP ${response.status})`,
        statusCode: response.ok ? 502 : response.status,
      });
    }

    throw cause;
  });

  if (!response.ok) {
    throw AppError.parseError(result ?? {});
  }

  return superjson.deserialize<SessionValidationResult>(result);
};
