import { describe, expect, it } from 'vitest';

import { getFieldFormIdsForRecipientUpdate } from './field-recipients';

describe('getFieldFormIdsForRecipientUpdate', () => {
  it('includes every field in a selected group', () => {
    const fields = [
      { formId: 'group-a-1', fieldGroupId: 'group-a' },
      { formId: 'group-a-2', fieldGroupId: 'group-a' },
      { formId: 'group-b-1', fieldGroupId: 'group-b' },
      { formId: 'ungrouped', fieldGroupId: null },
    ];

    expect(getFieldFormIdsForRecipientUpdate(fields, ['group-a-1'])).toEqual(['group-a-1', 'group-a-2']);
  });

  it('only includes selected fields when they are ungrouped', () => {
    const fields = [
      { formId: 'group-a-1', fieldGroupId: 'group-a' },
      { formId: 'group-a-2', fieldGroupId: 'group-a' },
      { formId: 'ungrouped-1', fieldGroupId: null },
      { formId: 'ungrouped-2', fieldGroupId: null },
    ];

    expect(getFieldFormIdsForRecipientUpdate(fields, ['ungrouped-1'])).toEqual(['ungrouped-1']);
  });
});
