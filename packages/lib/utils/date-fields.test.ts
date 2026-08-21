import { type Field, FieldType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { isDateFormatWithTime, VALID_DATE_FORMAT_VALUES } from '../constants/date-formats';
import { formatDateFieldValue, getDateFieldInputValue, isDateFieldAutoFillEnabled } from './date-fields';
import { extractFieldInsertionValues } from './envelope-signing';

describe('date fields', () => {
  it('keeps automatic fill enabled for existing metadata', () => {
    expect(isDateFieldAutoFillEnabled({ type: 'date' })).toBe(true);
    expect(isDateFieldAutoFillEnabled(undefined)).toBe(true);
  });

  it('allows manual date entry to opt out of automatic fill', () => {
    expect(isDateFieldAutoFillEnabled({ type: 'date', autoFill: false })).toBe(false);
  });

  it('formats a selected date using the document settings', () => {
    expect(formatDateFieldValue({ value: '2026-08-20', dateFormat: 'dd/MM/yyyy', timezone: 'UTC' })).toBe('20/08/2026');
  });

  it('detects whether the document format requires a time', () => {
    expect(isDateFormatWithTime('dd/MM/yyyy')).toBe(false);
    expect(isDateFormatWithTime('dd/MM/yyyy HH:mm')).toBe(true);
    expect(isDateFormatWithTime()).toBe(true);
  });

  it('formats a selected date and time using the document settings', () => {
    expect(
      formatDateFieldValue({
        value: '2026-08-20T13:45',
        dateFormat: 'dd/MM/yyyy hh:mm a',
        timezone: 'UTC',
      }),
    ).toBe('20/08/2026 01:45 PM');
  });

  it('preserves an existing date when opening a date picker', () => {
    expect(getDateFieldInputValue({ value: '20/08/2026', dateFormat: 'dd/MM/yyyy', timezone: 'UTC' })).toBe(
      '2026-08-20',
    );
  });

  it('preserves an existing date and time when opening a date-time picker', () => {
    expect(
      getDateFieldInputValue({
        value: '20/08/2026 01:45 PM',
        dateFormat: 'dd/MM/yyyy hh:mm a',
        timezone: 'UTC',
      }),
    ).toBe('2026-08-20T13:45');
  });

  it('preserves seconds when opening a date-time picker', () => {
    expect(
      getDateFieldInputValue({
        value: '2026-08-20 13:45:30',
        dateFormat: 'yyyy-MM-dd HH:mm:ss',
        timezone: 'UTC',
      }),
    ).toBe('2026-08-20T13:45:30');
  });

  it('leaves an invalid existing value empty', () => {
    expect(getDateFieldInputValue({ value: 'not-a-date', dateFormat: 'yyyy-MM-dd', timezone: 'UTC' })).toBeUndefined();
  });

  it.each(VALID_DATE_FORMAT_VALUES)('formats a selected date with %s', (dateFormat) => {
    const value = isDateFormatWithTime(dateFormat) ? '2026-08-20T13:45' : '2026-08-20';

    expect(formatDateFieldValue({ value, dateFormat, timezone: 'UTC' })).not.toBe('');
  });

  it('rejects invalid manual dates', () => {
    expect(() => formatDateFieldValue({ value: '2026-02-30', dateFormat: 'yyyy-MM-dd', timezone: 'UTC' })).toThrow(
      'Invalid date',
    );
  });

  it('rejects a date-only value for a date-time format', () => {
    expect(() =>
      formatDateFieldValue({ value: '2026-08-20', dateFormat: 'yyyy-MM-dd HH:mm', timezone: 'UTC' }),
    ).toThrow('Invalid date');
  });

  it('rejects a date-time value for a date-only format', () => {
    expect(() =>
      formatDateFieldValue({ value: '2026-08-20T13:45', dateFormat: 'yyyy-MM-dd', timezone: 'UTC' }),
    ).toThrow('Invalid date');
  });

  it('stores a selected date instead of replacing it with today', () => {
    const field = {
      fieldMeta: { type: 'date', autoFill: false },
    } as unknown as Field;

    expect(
      extractFieldInsertionValues({
        fieldValue: { type: FieldType.DATE, value: '2026-08-20' },
        field,
        documentMeta: {
          dateFormat: 'dd/MM/yyyy',
          timezone: 'UTC',
          typedSignatureEnabled: true,
        },
      }),
    ).toEqual({
      customText: '20/08/2026',
      inserted: true,
    });
  });
});
