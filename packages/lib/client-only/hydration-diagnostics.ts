import { SUPPORTED_LANGUAGE_CODES } from '../constants/locales';
import {
  getHydrationNodeName,
  type HydrationDiagnostics,
  sanitizeHydrationDiagnostics,
} from '../universal/hydration-diagnostics';
import { formatDocumentLogDate } from '../utils/document-log-date';

/** Capture before React changes the DOM. Never retain text, dates, URLs, or input values. */
export const captureHydrationDiagnostics = (
  document: Document,
  prefersDark: boolean,
): HydrationDiagnostics | undefined => {
  const html = document.documentElement;
  const language = html.lang;
  const theme = html.getAttribute('data-theme');
  const serverTheme = html.getAttribute('data-hydration-theme');
  const mismatchedDateFields: string[] = [];
  let dateTimeZone: string | undefined;
  for (const field of ['createdAt', 'updatedAt'] as const) {
    const element = document.querySelector(`time[data-hydration-date-field="${field}"]`);
    if (!element) {
      continue;
    }
    const date = new Date(element.getAttribute('datetime') ?? '');
    const locale = element.getAttribute('data-hydration-locale');
    const timeZone = element.getAttribute('data-hydration-time-zone');
    if (Number.isNaN(date.getTime()) || !locale || !timeZone) {
      continue;
    }
    dateTimeZone = timeZone;
    // Compare locally, then discard both strings and the timestamp. Reports
    // identify the exact formatting field without including document data.
    try {
      if (element.textContent !== formatDocumentLogDate(date, locale, timeZone)) {
        mismatchedDateFields.push(field);
      }
    } catch {
      // Malformed DOM metadata must not prevent the application from starting.
    }
  }
  const nodeNames = (node: Node | null) =>
    Array.from(node?.childNodes ?? [])
      .slice(0, 60)
      .map((child) => (child.nodeType === 10 ? 'doctype' : getHydrationNodeName(child.nodeName)))
      .join(',');

  return sanitizeHydrationDiagnostics({
    routeId: html.getAttribute('data-hydration-route'),
    requestId: html.getAttribute('data-hydration-request-id'),
    serverLanguage: SUPPORTED_LANGUAGE_CODES.find((supported) => supported === language) ?? null,
    clientLanguage: null,
    serverTheme: serverTheme === 'light' || serverTheme === 'dark' ? serverTheme : 'system',
    documentTheme: theme === 'light' || theme === 'dark' ? theme : null,
    preferredColorScheme: prefersDark ? 'dark' : 'light',
    documentNodes: nodeNames(document),
    htmlNodes: nodeNames(html),
    headNodes: nodeNames(document.head),
    bodyNodes: nodeNames(document.body),
    serverTimeZone: html.getAttribute('data-hydration-time-zone'),
    clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    dateTimeZone,
    mismatchedDateFields: mismatchedDateFields.join(','),
  });
};
