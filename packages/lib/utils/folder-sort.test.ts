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
    expect(parseFolderSort(saved, true)).toEqual({ by: 'createdAt', direction: 'desc' });
  });
  it.each(['asc', 'desc'])('restores a valid direction: %s', (direction) => {
    expect(parseFolderSort(JSON.stringify({ by: 'items', direction }), true)).toEqual({ by: 'items', direction });
  });
  it.each([
    { by: 'createdAt', direction: 'desc' },
    { by: 'name', direction: 'asc' },
  ] as const)('restores the saved $by choice', (sort) => {
    expect(parseFolderSort(JSON.stringify(sort), false)).toEqual(sort);
  });
  it('normalizes owner sorting when owner data is unavailable', () => {
    expect(parseFolderSort('{"by":"owner","direction":"desc"}', false)).toEqual({ by: 'createdAt', direction: 'desc' });
    expect(parseFolderSort('{"by":"owner","direction":"desc"}', true)).toEqual({ by: 'owner', direction: 'desc' });
  });
});
