import { describe, expect, it } from 'vitest';

import { FIELD_NUMBER_META_DEFAULT_VALUES, type TNumberFieldMeta } from '../types/field-meta';
import { validateNumberField } from './validate-number';

const numberMeta = (overrides: Partial<TNumberFieldMeta> = {}): TNumberFieldMeta => ({
  ...FIELD_NUMBER_META_DEFAULT_VALUES,
  ...overrides,
});

describe('validateNumberField', () => {
  it('validates the minimum value', () => {
    expect(validateNumberField('4', numberMeta({ minValue: 5 }))).toContain(
      'Value 4 is less than the minimum value of 5',
    );
  });

  it('treats zero min and max values as unset limits', () => {
    expect(validateNumberField('1', numberMeta({ minValue: 0, maxValue: 0 }))).toEqual([]);
  });

  it('checks range limits against comma-grouped values', () => {
    expect(validateNumberField('1,001.00', numberMeta({ maxValue: 1000, numberFormat: '123,456,789.00' }))).toContain(
      'Value 1,001.00 is greater than the maximum value of 1000',
    );
  });

  it('checks range limits against European-formatted values', () => {
    expect(validateNumberField('1.001,00', numberMeta({ maxValue: 1000, numberFormat: '123.456.789,00' }))).toContain(
      'Value 1.001,00 is greater than the maximum value of 1000',
    );
  });

  it('rejects malformed numeric values', () => {
    expect(validateNumberField('.', numberMeta())).toContain('Value is not a valid number');
  });
});
