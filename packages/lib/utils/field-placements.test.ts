import { describe, expect, it } from 'vitest';

import { getFieldsOutsideDocument, removeFieldPlacement, upsertFieldPlacement } from './field-placements';

describe('field placements', () => {
  it('keeps invalid placements for multiple fields and replaces only the matching field', () => {
    const first = { fieldFormId: 'field-1', x: 10 };
    const second = { fieldFormId: 'field-2', x: 20 };

    expect(upsertFieldPlacement(upsertFieldPlacement([], first), second)).toEqual([first, second]);
    expect(upsertFieldPlacement([first, second], { ...first, x: 30 })).toEqual([{ ...first, x: 30 }, second]);
  });

  it('removes only the requested field placement', () => {
    const placements = [
      { fieldFormId: 'field-1', x: 10 },
      { fieldFormId: 'field-2', x: 20 },
    ];

    expect(removeFieldPlacement(placements, 'field-1')).toEqual([placements[1]]);
  });
});

describe('getFieldsOutsideDocument', () => {
  it('returns fields before or after the available document pages', () => {
    const fields = [
      { id: 1, envelopeItemId: 'item-1', page: 1 },
      { id: 2, envelopeItemId: 'item-1', page: 3 },
      { id: 3, envelopeItemId: 'item-1', page: 0 },
      { id: 4, envelopeItemId: 'item-2', page: 4 },
    ];

    expect(
      getFieldsOutsideDocument(fields, [
        { id: 'item-1', pageCount: 2 },
        { id: 'item-2', pageCount: 3 },
      ]),
    ).toEqual([fields[1], fields[2], fields[3]]);
  });

  it('ignores fields when the page count is not available yet', () => {
    const field = { id: 1, envelopeItemId: 'item-1', page: 17 };

    expect(getFieldsOutsideDocument([field], [{ id: 'item-1' }])).toEqual([]);
  });
});
