import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SIGNATURE_FONT_FAMILY,
  getSignatureFontFamily,
  isSignatureFontFamily,
  SIGNATURE_FONT_FAMILY_KEYS,
} from './signatures';

describe('signature font families', () => {
  it('includes the five supported styles', () => {
    expect(SIGNATURE_FONT_FAMILY_KEYS).toEqual(['caveat', 'dancingScript', 'kalam', 'pacifico', 'satisfy']);
  });

  it('falls back to Caveat for missing or invalid values', () => {
    expect(getSignatureFontFamily().cssFamily).toBe('Caveat');
    expect(getSignatureFontFamily('unknown').cssFamily).toBe('Caveat');
    expect(DEFAULT_SIGNATURE_FONT_FAMILY).toBe('caveat');
  });

  it('validates only supported font keys', () => {
    expect(isSignatureFontFamily('pacifico')).toBe(true);
    expect(isSignatureFontFamily('unknown')).toBe(false);
    expect(isSignatureFontFamily(null)).toBe(false);
  });
});
