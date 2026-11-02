import { describe, expect, it } from 'vitest';

import { getTemplateFieldPageReview } from './template-field-page-review';

const field = { id: 1, envelopeItemId: 'template_item', page: 1, fieldGroupId: null };

describe('template field page review', () => {
  it('keeps fields on available pages and lists missing pages', () => {
    const missing = { ...field, id: 2, page: 3 };
    expect(getTemplateFieldPageReview([field, missing], 2)).toEqual({
      fieldsToApply: [field],
      omittedFields: [{ field: missing, reason: 'missing-page' }],
    });
  });

  it('keeps a group intact when one of its members is omitted', () => {
    const groupField = { ...field, fieldGroupId: 'group_1' };
    const missing = { ...groupField, id: 2, page: 3 };
    expect(getTemplateFieldPageReview([groupField, missing], 2)).toEqual({
      fieldsToApply: [],
      omittedFields: [
        { field: groupField, reason: 'group' },
        { field: missing, reason: 'missing-page' },
      ],
    });
  });

  it('propagates omissions through conditional descendants and their groups', () => {
    const parent = { ...field, page: 3 };
    const child = { ...field, id: 2, fieldGroupId: 'group_1', conditionalChildRule: { parentFieldId: 1 } };
    const sibling = { ...field, id: 3, fieldGroupId: 'group_1' };
    const grandchild = { ...field, id: 4, conditionalChildRule: { parentFieldId: 3 } };
    const independent = { ...field, id: 5 };
    const review = getTemplateFieldPageReview([grandchild, sibling, child, parent, independent], 2);
    expect(review.fieldsToApply).toEqual([independent]);
    expect(review.omittedFields.map(({ field, reason }) => [field.id, reason])).toEqual([
      [4, 'condition'],
      [3, 'group'],
      [2, 'condition'],
      [1, 'missing-page'],
    ]);
  });

  it('preserves conditions and groups when all pages exist', () => {
    const fields = [field, { ...field, id: 2, fieldGroupId: 'group', conditionalChildRule: { parentFieldId: 1 } }];
    expect(getTemplateFieldPageReview(fields, 2)).toEqual({ fieldsToApply: fields, omittedFields: [] });
  });

  it('does not filter when adding the template PDF itself', () => {
    const fields = [{ ...field, page: 3 }];
    expect(getTemplateFieldPageReview(fields, undefined)).toEqual({ fieldsToApply: fields, omittedFields: [] });
  });
});
