import { describe, expect, it } from 'vitest';

import { parseFolderSort } from './folder-sort';

describe('saved folder sort', () => {
  it.each([
    null,
    '',
    'null',
    '[]',
    'true',
    '42',
    '{',
    '{}',
    '{"by":"name","direction":"arbitrary"}',
    '{"by":"name","direction":true}',
    '{"by":"name","direction":1}',
    '{"by":"unknown","direction":"asc"}',
  ])('falls back safely for untrusted storage: %s', (saved) => {
    expect(parseFolderSort(saved, true)).toEqual({ by: 'name', direction: 'asc' });
  });
  it.each(['asc', 'desc'])('restores a valid direction: %s', (direction) => {
    expect(parseFolderSort(JSON.stringify({ by: 'items', direction }), true)).toEqual({ by: 'items', direction });
  });
  it('normalizes owner sorting when owner data is unavailable', () => {
    expect(parseFolderSort('{"by":"owner","direction":"desc"}', false)).toEqual({ by: 'name', direction: 'asc' });
    expect(parseFolderSort('{"by":"owner","direction":"desc"}', true)).toEqual({ by: 'owner', direction: 'desc' });
  });
});
