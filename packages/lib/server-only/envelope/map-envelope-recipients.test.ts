import { describe, expect, it } from 'vitest';

import { mapEnvelopeRecipients } from './map-envelope-recipients';

const signatureField = {
  type: 'SIGNATURE' as const,
  fieldMeta: { type: 'signature' as const, overflow: 'auto' as const },
  page: 1,
  positionX: 0,
  positionY: 0,
  width: 1,
  height: 1,
};

describe('mapEnvelopeRecipients', () => {
  it('maps fields to document data by filename and index', () => {
    const recipients = mapEnvelopeRecipients(
      [
        {
          email: 'signer@example.com',
          name: 'Signer',
          role: 'SIGNER',
          fields: [
            { ...signatureField, identifier: 'first.pdf' },
            { ...signatureField, identifier: 1 },
            signatureField,
          ],
        },
      ],
      [
        { title: 'first.pdf', documentDataId: 'data-first' },
        { title: 'second.pdf', documentDataId: 'data-second' },
      ],
    );

    expect(recipients?.[0]?.fields?.map((field) => field.documentDataId)).toEqual([
      'data-first',
      'data-second',
      'data-first',
    ]);
  });

  it('rejects a field that cannot be mapped to an uploaded document', () => {
    expect(() =>
      mapEnvelopeRecipients(
        [
          {
            email: 'signer@example.com',
            name: 'Signer',
            role: 'SIGNER',
            fields: [{ ...signatureField, identifier: 'missing.pdf' }],
          },
        ],
        [{ title: 'first.pdf', documentDataId: 'data-first' }],
      ),
    ).toThrow('Document data not found');
  });
});
