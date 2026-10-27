import { describe, expect, it } from 'vitest';

import { ZCreateFolderRequestSchema, ZGetFoldersSchema, ZUpdateFolderRequestSchema } from './schema';

describe('ZCreateFolderRequestSchema', () => {
  it('accepts an omitted parent for a root folder', () => {
    expect(
      ZCreateFolderRequestSchema.parse({
        name: 'Root folder',
      }),
    ).toEqual({
      name: 'Root folder',
    });
  });

  it('trims surrounding whitespace from a folder name', () => {
    expect(
      ZCreateFolderRequestSchema.parse({
        name: ' Folder name ',
      }),
    ).toEqual({
      name: 'Folder name',
    });
  });

  it('rejects a whitespace-only folder name', () => {
    expect(() =>
      ZCreateFolderRequestSchema.parse({
        name: '   ',
      }),
    ).toThrow();
  });
});

describe('ZUpdateFolderRequestSchema', () => {
  it('trims a renamed folder', () => {
    expect(
      ZUpdateFolderRequestSchema.parse({
        folderId: 'folder_1',
        data: { name: ' Renamed folder ' },
      }),
    ).toEqual({
      folderId: 'folder_1',
      data: { name: 'Renamed folder' },
    });
  });
});

describe('folder request limits', () => {
  it('accepts recently created folder ordering', () => {
    expect(ZGetFoldersSchema.parse({ sortBy: 'createdAt', sortDirection: 'desc' })).toMatchObject({
      sortBy: 'createdAt',
      sortDirection: 'desc',
    });
  });

  it.each([
    { parentId: 'x'.repeat(129) },
    { cursor: 1_000_001 },
    { perPage: 101 },
    { perPage: 1.5 },
    { perPage: -1 },
    { page: 1.5 },
    { page: Infinity },
    { page: 0 },
    { childDepth: 5 },
    { sortDirection: 'arbitrary' },
    { sortBy: { name: 'asc' } },
    { query: 'x'.repeat(201) },
  ])('rejects malformed or oversized input: %j', (input) => {
    expect(ZGetFoldersSchema.safeParse(input).success).toBe(false);
  });
  it('accepts bounded child pages and normalizes search whitespace', () => {
    expect(ZGetFoldersSchema.parse({ parentId: 'folder', page: 2, perPage: 50, query: ' nested ' })).toMatchObject({
      parentId: 'folder',
      page: 2,
      perPage: 50,
      query: 'nested',
    });
  });
});
