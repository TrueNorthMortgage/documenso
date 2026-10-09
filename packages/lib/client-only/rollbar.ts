import Rollbar from 'rollbar';
import { sanitizeHydrationDiagnostics } from '../universal/hydration-diagnostics';
import { getRollbarConfiguration } from '../universal/rollbar';
import { env } from '../utils/env';

let browserRollbar: Rollbar | undefined;
// Persist across refreshes in this tab; storage restrictions fall back to page memory.
const reportedHydrationErrors = new Set<string>();
const MAX_HYDRATION_ERROR_SIGNATURES = 100;
const HYDRATION_ERROR_STORAGE_KEY = 'documenso:reported-hydration-errors';
let hasLoadedHydrationErrors = false;
let hydrationReleaseKey = '';

export const initializeBrowserRollbar = () => {
  const accessToken = env('NEXT_PUBLIC_ROLLBAR_ACCESS_TOKEN');

  if (typeof window === 'undefined' || !accessToken || browserRollbar) {
    return;
  }

  const configuration = getRollbarConfiguration();
  hydrationReleaseKey = JSON.stringify([configuration.environment, configuration.codeVersion]);
  browserRollbar = new Rollbar({ ...configuration, accessToken });
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
  if (error instanceof Error && info.componentStack && !error.stack?.endsWith(info.componentStack)) {
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

  const componentNames = Array.from(
    (info.componentStack ?? '').matchAll(/^\s+at ([A-Za-z_$][A-Za-z0-9_$.-]*)(?=\s|\(|$)/gm),
  )
    .slice(0, 60)
    .map((match) => match[1].slice(0, 99))
    .join(',');

  if (hydration && info.componentStack) {
    // Bare React component frames are dropped by the SDK's stack parser.
    // Preserve their code identifiers without forwarding URLs or props.
    hydration.componentNames = componentNames;
  }

  if (error instanceof Error && browserRollbar) {
    loadReportedHydrationErrors();
    // Request IDs and DOM snapshots change between loads, not the underlying failure.
    // Store component identifiers instead of stack URLs, which can contain signing tokens.
    const signature = JSON.stringify([
      hydrationReleaseKey,
      error.name,
      error.message,
      hydration?.routeId ?? null,
      componentNames,
    ]);
    if (!reportedHydrationErrors.has(signature)) {
      if (reportedHydrationErrors.size >= MAX_HYDRATION_ERROR_SIGNATURES) {
        const oldestSignature = reportedHydrationErrors.values().next().value;
        if (oldestSignature !== undefined) {
          reportedHydrationErrors.delete(oldestSignature);
        }
      }
      reportedHydrationErrors.add(signature);
      try {
        window.sessionStorage.setItem(HYDRATION_ERROR_STORAGE_KEY, JSON.stringify([...reportedHydrationErrors]));
      } catch {
        // Reporting must still work when browser storage is unavailable or full.
      }
      if (hydration) {
        browserRollbar.error(error, { hydration });
      } else {
        browserRollbar.error(error);
      }
    }
  }
  console.error(error);
};

const loadReportedHydrationErrors = () => {
  if (hasLoadedHydrationErrors) {
    return;
  }
  hasLoadedHydrationErrors = true;

  try {
    const stored: unknown = JSON.parse(window.sessionStorage.getItem(HYDRATION_ERROR_STORAGE_KEY) ?? '[]');
    if (Array.isArray(stored)) {
      for (const signature of stored.slice(-MAX_HYDRATION_ERROR_SIGNATURES)) {
        if (typeof signature === 'string') {
          reportedHydrationErrors.add(signature);
        }
      }
    }
  } catch {
    // Invalid or blocked storage falls back to deduplication for this page.
  }
};
