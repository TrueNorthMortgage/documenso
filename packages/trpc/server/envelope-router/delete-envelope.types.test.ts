import { describe, expect, it } from 'vitest';

import { ZDeleteDocumentRequestSchema } from '../document-router/delete-document.types';
import { ZBulkDeleteEnvelopesRequestSchema } from './bulk-delete-envelopes.types';
import { ZDeleteEnvelopeRequestSchema } from './delete-envelope.types';

describe.each([
  { name: 'envelope', schema: ZDeleteEnvelopeRequestSchema, identifier: { envelopeId: 'envelope_fixture' } },
  {
    name: 'bulk envelope',
    schema: ZBulkDeleteEnvelopesRequestSchema,
    identifier: { envelopeIds: ['envelope_fixture'] },
  },
  { name: 'legacy document', schema: ZDeleteDocumentRequestSchema, identifier: { documentId: 1 } },
])('$name cancellation message', ({ schema, identifier }) => {
  it('remains optional', () => {
    expect(schema.parse(identifier)).toEqual(identifier);
  });

  it('trims the message', () => {
    expect(schema.parse({ ...identifier, cancellationReason: '  Updated package  ' })).toMatchObject({
      cancellationReason: 'Updated package',
    });
  });

  it('accepts a message at the length limit', () => {
    expect(schema.safeParse({ ...identifier, cancellationReason: 'a'.repeat(2000) }).success).toBe(true);
  });

  it('rejects an oversized message', () => {
    expect(schema.safeParse({ ...identifier, cancellationReason: 'a'.repeat(2001) }).success).toBe(false);
  });
});
