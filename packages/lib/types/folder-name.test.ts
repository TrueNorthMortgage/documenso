import { describe, expect, it } from 'vitest';

import { AppErrorCode } from '../errors/app-error';
import { validateFolderName } from '../server-only/folder/validate-folder-name';
import { MAX_FOLDER_NAME_LENGTH, ZFolderNameSchema } from './folder-name';

describe('folder name validation', () => {
  it('preserves Unicode and punctuation and trims surrounding whitespace', () => {
    expect(ZFolderNameSchema.parse("  Finanças 🏠 — O'Connor <draft>  ")).toBe("Finanças 🏠 — O'Connor <draft>");
  });

  it('accepts the length boundary and rejects longer names', () => {
    expect(ZFolderNameSchema.safeParse('x'.repeat(MAX_FOLDER_NAME_LENGTH)).success).toBe(true);
    expect(ZFolderNameSchema.safeParse('x'.repeat(MAX_FOLDER_NAME_LENGTH + 1)).success).toBe(false);
  });

  it.each([
    '',
    '   ',
    'invalid\u0000name',
    'invalid\nname',
    'invalid\u007fname',
  ])('rejects invalid name %j before persistence', (name) => {
    expect(ZFolderNameSchema.safeParse(name).success).toBe(false);
    expect(() => validateFolderName(name)).toThrow(expect.objectContaining({ code: AppErrorCode.INVALID_BODY }));
  });
});
