import { describe, expect, it } from 'vitest';

import { getFieldOptionValue } from './field-option-values';

describe('getFieldOptionValue', () => {
  it('uses the entered option value when available', () => {
    expect(getFieldOptionValue({ id: 4, value: 'Approved' }, 0)).toBe('Approved');
  });

  it('uses the option ID when the entered value is blank', () => {
    expect(getFieldOptionValue({ id: 4, value: '' }, 0)).toBe('Option 4');
  });

  it('uses the option index when a legacy option has no ID', () => {
    expect(getFieldOptionValue({ value: '' }, 2)).toBe('Option 3');
  });
});
