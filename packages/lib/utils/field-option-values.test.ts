import { describe, expect, it } from 'vitest';

import { getFieldOptionId, getFieldOptionValue, getNextFieldOptionId } from './field-option-values';

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

describe('field option IDs', () => {
  it('uses the option ID when available', () => {
    expect(getFieldOptionId({ id: 4 }, 0)).toBe(4);
  });

  it('uses the option index when the option has no ID', () => {
    expect(getFieldOptionId({}, 2)).toBe(3);
  });

  it('returns the next ID after all existing options', () => {
    expect(getNextFieldOptionId([{ id: 1 }, { id: 3 }, { id: 2 }])).toBe(4);
  });
});
