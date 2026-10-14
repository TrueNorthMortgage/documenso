import { DocumentStatus, EnvelopeType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { getEnvelopeReassignmentSelection } from './envelope-reassignment';

const document = {
  id: 'pending',
  title: 'Pending envelope',
  type: EnvelopeType.DOCUMENT,
  teamId: 1,
  userId: 10,
  status: DocumentStatus.PENDING,
  completedAt: null,
  deletedAt: null,
};

describe('bulk envelope reassignment', () => {
  it('keeps draft, pending and completed envelopes in a mixed selection', () => {
    const documents = [
      document,
      { ...document, id: 'draft', status: DocumentStatus.DRAFT },
      { ...document, id: 'completed', status: DocumentStatus.COMPLETED, completedAt: new Date() },
      { ...document, id: 'rejected', status: DocumentStatus.REJECTED },
    ];
    const result = getEnvelopeReassignmentSelection(documents, 1, 20);
    expect(result.eligible).toEqual(documents.slice(0, 3));
    expect(result.skipped.map(({ id }) => id)).toEqual(['rejected']);
  });

  it('skips deleted, inconsistent, other-team, template and already-owned envelopes', () => {
    const documents = [
      { ...document, deletedAt: new Date() },
      { ...document, completedAt: new Date() },
      { ...document, teamId: 2 },
      { ...document, type: EnvelopeType.TEMPLATE },
      { ...document, userId: 20 },
    ];
    expect(getEnvelopeReassignmentSelection(documents, 1, 20)).toEqual({ eligible: [], skipped: documents });
  });

  it('can choose a sender who already owns part of a selection', () => {
    const owned = { ...document, id: 'owned', userId: 20 };
    expect(getEnvelopeReassignmentSelection([document, owned], 1, 20)).toEqual({
      eligible: [document],
      skipped: [owned],
    });
  });
});
