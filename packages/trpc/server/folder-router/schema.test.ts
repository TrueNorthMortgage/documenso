import { describe, expect, it } from 'vitest';

import { ZCreateFolderRequestSchema } from './schema';

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
});
