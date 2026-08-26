import { describe, expect, it } from 'vitest';

import {
  DEFAULT_INITIALS_OVERFLOW_MODE,
  DEFAULT_NAME_OVERFLOW_MODE,
  DEFAULT_NUMBER_OVERFLOW_MODE,
  DEFAULT_TEXT_OVERFLOW_MODE,
  resolveFieldOverflowMode,
} from './field-meta';

describe('field overflow defaults', () => {
  it('uses automatic overflow for generic text fields', () => {
    expect(DEFAULT_INITIALS_OVERFLOW_MODE).toBe('auto');
    expect(DEFAULT_NAME_OVERFLOW_MODE).toBe('auto');
    expect(DEFAULT_NUMBER_OVERFLOW_MODE).toBe('auto');
    expect(DEFAULT_TEXT_OVERFLOW_MODE).toBe('auto');
    expect(resolveFieldOverflowMode({ type: 'initials' })).toBe('auto');
    expect(resolveFieldOverflowMode({ type: 'name' })).toBe('auto');
    expect(resolveFieldOverflowMode({ type: 'number' })).toBe('auto');
    expect(resolveFieldOverflowMode({ type: 'text' })).toBe('auto');
  });

  it('uses the field type when metadata is missing', () => {
    expect(resolveFieldOverflowMode(undefined, 'INITIALS')).toBe('auto');
    expect(resolveFieldOverflowMode(undefined, 'NAME')).toBe('auto');
    expect(resolveFieldOverflowMode(undefined, 'NUMBER')).toBe('auto');
    expect(resolveFieldOverflowMode(undefined, 'TEXT')).toBe('auto');
    expect(resolveFieldOverflowMode(undefined, 'DATE')).toBe('auto');
    expect(resolveFieldOverflowMode(undefined, 'EMAIL')).toBe('auto');
  });

  it('preserves explicit overflow settings', () => {
    expect(resolveFieldOverflowMode({ type: 'initials', overflow: 'crop' })).toBe('crop');
    expect(resolveFieldOverflowMode({ type: 'name', overflow: 'crop' })).toBe('crop');
    expect(resolveFieldOverflowMode({ type: 'text', overflow: 'horizontal' })).toBe('horizontal');
  });
});
