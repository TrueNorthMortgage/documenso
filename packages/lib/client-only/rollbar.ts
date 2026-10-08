import Rollbar from 'rollbar';
import { sanitizeHydrationDiagnostics } from '../universal/hydration-diagnostics';
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

export const reportBrowserHydrationError = (
  error: unknown,
  info: { componentStack?: string },
  diagnostics?: unknown,
) => {
  if (error instanceof Error && info.componentStack) {
    // Component frames identify the failing UI without collecting route URLs or props.
    error.stack = `${error.stack ?? `${error.name}: ${error.message}`}\n${info.componentStack}`;
  }

  const hydration = sanitizeHydrationDiagnostics(diagnostics);

  if (hydration && error instanceof Error) {
    hydration.mismatchKind = hydration.mismatchedDateFields
      ? 'formatted-date'
      : /Text content does not match|error #425\b/.test(error.message)
        ? 'text'
        : /Hydration failed|error #418\b/.test(error.message)
          ? 'structure'
          : /error while hydrating|error #423\b/.test(error.message)
            ? 'recovery'
            : 'unknown';
  }

  if (hydration && info.componentStack) {
    // Bare React component frames are dropped by the SDK's stack parser.
    // Preserve their code identifiers without forwarding URLs or props.
    hydration.componentNames = Array.from(
      info.componentStack.matchAll(/^\s+at ([A-Za-z_$][A-Za-z0-9_$.-]*)(?=\s|\(|$)/gm),
    )
      .slice(0, 60)
      .map((match) => match[1].slice(0, 99))
      .join(',');
  }

  if (error instanceof Error && hydration) {
    browserRollbar?.error(error, { hydration });
  } else {
    reportBrowserError(error);
  }
  console.error(error);
};
