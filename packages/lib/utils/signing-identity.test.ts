import { FieldType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { getFilledIdentityFieldsToUpdate } from './signing-identity';

describe('editing signing identity', () => {
  it.each([
    FieldType.NAME,
    FieldType.INITIALS,
  ])('updates only filled, editable %s fields for the active recipient', (type) => {
    const field = { type, recipientId: 1, inserted: true, customText: 'Old' };
    const fields = [
      { ...field, id: 1 },
      { ...field, id: 2, inserted: false, customText: '' },
      { ...field, id: 3, recipientId: 2 },
      { ...field, id: 4, fieldMeta: { readOnly: true } },
      { ...field, id: 5, fieldGroup: { readOnly: true } },
      { ...field, id: 6, type: FieldType.SIGNATURE },
      { ...field, id: 7, type: type === FieldType.NAME ? FieldType.INITIALS : FieldType.NAME },
      { ...field, id: 8, customText: 'Corrected' },
    ];

    expect(getFilledIdentityFieldsToUpdate(fields, 1, type, 'Corrected').map((candidate) => candidate.id)).toEqual([1]);
    expect(fields[1].inserted).toBe(false);
  });
});
