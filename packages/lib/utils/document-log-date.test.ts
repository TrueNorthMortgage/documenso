import { DateTime, Settings } from 'luxon';
import { afterEach, describe, expect, it } from 'vitest';

import { formatDocumentLogDate, getDocumentLogTimeZone } from './document-log-date';

const originalZone = Settings.defaultZone;
afterEach(() => {
  Settings.defaultZone = originalZone;
});

describe('document log dates', () => {
  it('renders identical dates on a UTC server and an Edmonton browser', () => {
    const date = new Date('2026-10-08T15:45:27.000Z');
    Settings.defaultZone = 'UTC';
    const previousServerText = DateTime.fromJSDate(date)
      .setLocale('en')
      .toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS);
    const serverText = formatDocumentLogDate(date, 'en', 'America/Edmonton');
    Settings.defaultZone = 'America/Edmonton';
    const previousBrowserText = DateTime.fromJSDate(date)
      .setLocale('en')
      .toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS);
    const browserText = formatDocumentLogDate(date, 'en', 'America/Edmonton');

    expect(previousServerText).not.toBe(previousBrowserText);
    expect(serverText).toBe(browserText);
    expect(serverText).toBe('Oct 8, 2026, 9:45:27 AM');
  });

  it('uses UTC consistently when a document has no valid timezone', () => {
    const date = new Date('2026-10-08T15:45:27.000Z');
    Settings.defaultZone = 'Asia/Tokyo';
    expect(getDocumentLogTimeZone(null)).toBe('UTC');
    expect(getDocumentLogTimeZone('invalid-zone')).toBe('UTC');
    expect(formatDocumentLogDate(date, 'en', null)).toBe('Oct 8, 2026, 3:45:27 PM');
  });
});
