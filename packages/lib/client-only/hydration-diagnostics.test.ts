import { describe, expect, it } from 'vitest';

import { sanitizeHydrationDiagnostics } from '../universal/hydration-diagnostics';
import { sanitizeRollbarPayload } from '../universal/rollbar';
import { captureHydrationDiagnostics } from './hydration-diagnostics';

const createDocument = (attributes: Record<string, string> = {}) =>
  ({
    documentElement: {
      lang: 'en',
      childNodes: [{ nodeName: 'HEAD' }, { nodeName: 'BODY' }, { nodeName: 'DIV' }],
      getAttribute: (name: string) =>
        (
          ({
            'data-theme': 'dark',
            'data-hydration-theme': 'system',
            'data-hydration-route': 'routes/_recipient+/sign.$token+/_index',
            'data-hydration-request-id': '7549bab8-df86-4543-963c-6c5619435366',
            ...attributes,
          }) as Record<string, string>
        )[name] ?? null,
    },
    querySelector: () => null,
    childNodes: [
      { nodeName: 'html', nodeType: 10 },
      { nodeName: 'HTML', nodeType: 1 },
    ],
    head: { childNodes: [{ nodeName: 'META' }, { nodeName: 'SCRIPT', textContent: 'secret-token' }] },
    body: {
      childNodes: [{ nodeName: 'DIV', textContent: 'private document' }, { nodeName: 'PRIVATE-CUSTOM-ELEMENT' }],
    },
  }) as unknown as Document;

describe('hydration diagnostics', () => {
  it('does not prevent startup when a date marker contains an invalid locale', () => {
    const document = createDocument();
    Object.assign(document, {
      querySelector: () => ({
        textContent: 'private text',
        getAttribute: (name: string) =>
          (
            ({
              datetime: '2026-10-08T15:45:27.000Z',
              'data-hydration-locale': 'invalid_locale',
              'data-hydration-time-zone': 'UTC',
            }) as Record<string, string>
          )[name],
      }),
    });

    expect(captureHydrationDiagnostics(document, false)?.mismatchedDateFields).toBe('');
  });

  it('identifies the exact mismatched date field without retaining its timestamp or text', () => {
    const document = createDocument({ 'data-hydration-time-zone': 'UTC' });
    Object.assign(document, {
      querySelector: (selector: string) =>
        selector.includes('createdAt')
          ? {
              textContent: 'Oct 8, 2026, 3:45:27 PM',
              getAttribute: (name: string) =>
                (
                  ({
                    datetime: '2026-10-08T15:45:27.000Z',
                    'data-hydration-locale': 'en',
                    'data-hydration-time-zone': 'America/Edmonton',
                  }) as Record<string, string>
                )[name] ?? null,
            }
          : null,
    });

    const snapshot = captureHydrationDiagnostics(document, false);
    expect(snapshot).toMatchObject({
      mismatchedDateFields: 'createdAt',
      serverTimeZone: 'UTC',
      dateTimeZone: 'America/Edmonton',
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/2026-10-08|3:45:27|Oct 8/);
  });

  it('captures static route identifiers and structural nodes without document contents', () => {
    const snapshot = captureHydrationDiagnostics(createDocument(), true);

    expect(snapshot).toMatchObject({
      documentNodes: 'doctype,html',
      htmlNodes: 'head,body,div',
      routeId: 'routes/_recipient+/sign.$token+/_index',
      serverLanguage: 'en',
      serverTheme: 'system',
      documentTheme: 'dark',
      preferredColorScheme: 'dark',
      headNodes: 'meta,script',
      bodyNodes: 'div,other',
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/secret-token|private document|PRIVATE-CUSTOM/);
  });

  it('rejects URLs and invalid request IDs instead of forwarding them', () => {
    expect(
      captureHydrationDiagnostics(
        createDocument({
          'data-hydration-route': '/sign/secret-token?email=private@example.com',
        }),
        false,
      ),
    ).toBeUndefined();
    expect(
      captureHydrationDiagnostics(
        createDocument({
          'data-hydration-request-id': 'private@example.com',
        }),
        false,
      ),
    ).toBeUndefined();
  });

  it('keeps only the approved diagnostic schema on repeated sanitization', () => {
    const hydration = {
      ...captureHydrationDiagnostics(createDocument(), false),
      clientLanguage: 'fr',
      url: '/sign/secret-token',
      document: 'private document',
    };
    const payload = { custom: { hydration, input: 'secret input' } };

    sanitizeRollbarPayload(payload);
    sanitizeRollbarPayload(payload);

    expect(payload.custom).toEqual({ hydration: sanitizeHydrationDiagnostics(hydration) });
    expect(JSON.stringify(payload)).not.toMatch(/secret-token|private document|secret input/);
  });

  it('caps structure snapshots and does not retain arbitrary node names', () => {
    const document = createDocument();
    Object.assign(document.head, { childNodes: Array.from({ length: 100 }, () => ({ nodeName: 'META' })) });
    expect(captureHydrationDiagnostics(document, false)?.headNodes.split(',')).toHaveLength(60);
  });
});
