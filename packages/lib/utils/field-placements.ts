import type { Field } from '@prisma/client';

export type TEnvelopeItemPageCount = {
  id: string;
  pageCount?: number;
};

export type TFieldPageReference = Pick<Field, 'envelopeItemId' | 'page'>;

/**
 * Finds fields whose page reference cannot be rendered by the corresponding PDF.
 *
 * Page counts are optional because newly-created embedded envelopes do not have
 * uploaded PDFs until they are submitted.
 */
export const getFieldsOutsideDocument = <T extends TFieldPageReference>(
  fields: T[],
  envelopeItems: TEnvelopeItemPageCount[],
): T[] => {
  const pageCounts = new Map(envelopeItems.map((item) => [item.id, item.pageCount]));

  return fields.filter((field) => {
    const pageCount = pageCounts.get(field.envelopeItemId);

    if (pageCount === undefined) {
      return false;
    }

    return field.page < 1 || field.page > pageCount;
  });
};
