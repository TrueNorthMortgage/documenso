import { describe, expect, it } from 'vitest';

import { isSameEmail, normalizeEmail } from './email';

describe('email utilities', () => {
  it('normalizes email casing and whitespace', () => {
    expect(normalizeEmail(' Test.User@Example.com ')).toBe('test.user@example.com');
  });

  it('matches equivalent email addresses regardless of casing', () => {
    expect(isSameEmail('Test.User@Example.com', 'test.user@example.com')).toBe(true);
  });

  it('does not match a missing email address', () => {
    expect(isSameEmail(undefined, 'test.user@example.com')).toBe(false);
  });
});
