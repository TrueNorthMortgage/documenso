import { describe, expect, it } from 'vitest';

import { ZCreateFolderRequestSchema, ZUpdateFolderRequestSchema } from './schema';

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
