import { describe, expect, it } from 'vitest';

import { extractInitials } from './recipient-formatter';

describe('extractInitials', () => {
  it('keeps the existing two-initial default', () => {
    expect(extractInitials('John Ronald Reuel Tolkien')).toBe('JR');
  });

  it('supports extracting all initials when requested', () => {
    expect(extractInitials('John Ronald Reuel Tolkien', Number.POSITIVE_INFINITY)).toBe('JRRT');
  });
});
