import { describe, expect, it } from 'vitest';

import { getPendingPreparationDocumentMetadata } from './document-metadata';

describe('getPendingPreparationDocumentMetadata', () => {
  it('restores persisted placeholder metadata', () => {
    const placeholders = [
      {
        placeholder: '{{SIGNATURE, r1}}',
        recipient: 'r1',
        fieldAndMeta: {
          type: 'SIGNATURE' as const,
          fieldMeta: { type: 'signature' as const, overflow: 'auto' as const },
        },
        page: 1,
        x: 10,
        y: 20,
        width: 30,
        height: 40,
        pageWidth: 600,
        pageHeight: 800,
      },
    ];

    expect(getPendingPreparationDocumentMetadata({ name: 'document.pdf', placeholders })).toEqual({
      name: 'document.pdf',
      placeholders,
    });
  });

  it('ignores malformed metadata', () => {
    expect(getPendingPreparationDocumentMetadata({ name: 123, placeholders: 'invalid' })).toEqual({
      name: undefined,
      placeholders: undefined,
    });
  });
});
