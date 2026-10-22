import type { TFieldInitials } from '@documenso/lib/types/field';
import { FieldType } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { handleInitialsFieldClick } from './initial-field';

const field = { type: FieldType.INITIALS, inserted: false } as TFieldInitials;

describe('initials field signing', () => {
  it('requires confirmation before inserting initials', async () => {
    const requestInitials = vi.fn().mockResolvedValue('TW');

    expect(await handleInitialsFieldClick({ field, requestInitials })).toEqual({
      type: FieldType.INITIALS,
      value: 'TW',
    });
    expect(requestInitials).toHaveBeenCalledTimes(1);
  });

  it('does not sign when confirmation is cancelled', async () => {
    expect(await handleInitialsFieldClick({ field, requestInitials: async () => null })).toBeNull();
  });

  it('removes an inserted field without prompting', async () => {
    const requestInitials = vi.fn();

    expect(await handleInitialsFieldClick({ field: { ...field, inserted: true }, requestInitials })).toEqual({
      type: FieldType.INITIALS,
      value: null,
    });
    expect(requestInitials).not.toHaveBeenCalled();
  });
});
