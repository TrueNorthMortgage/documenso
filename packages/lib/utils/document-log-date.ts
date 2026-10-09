import { DateTime, IANAZone } from 'luxon';

export const getDocumentLogTimeZone = (timeZone?: string | null) =>
  timeZone && IANAZone.isValidZone(timeZone) ? timeZone : 'UTC';

export const formatDocumentLogDate = (date: Date, locale: string, timeZone?: string | null) =>
  DateTime.fromJSDate(date, { zone: getDocumentLogTimeZone(timeZone) })
    .setLocale(locale)
    .toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS)
    // ICU versions can use different non-breaking spaces for the same locale.
    .replace(/[\u00a0\u202f]/g, ' ');
