import { DocumentSource, DocumentStatus, DocumentVisibility, EnvelopeType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { mapEnvelopeToWebhookDocumentPayload, ZWebhookDocumentSchema } from './webhook-payload';

describe('mapEnvelopeToWebhookDocumentPayload', () => {
  it('includes the envelope ID alongside the legacy document ID', () => {
    const envelope = {
      id: 'envelope_test',
      secondaryId: 'document_42',
      externalId: 'zeus:request-42',
      type: EnvelopeType.DOCUMENT,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedAt: null,
      deletedAt: null,
      title: 'Test document',
      status: DocumentStatus.DRAFT,
      source: DocumentSource.DOCUMENT,
      authOptions: null,
      formValues: null,
      visibility: DocumentVisibility.EVERYONE,
      userId: 1,
      teamId: 1,
      templateId: null,
      recipients: [],
      documentMeta: null,
    } as Parameters<typeof mapEnvelopeToWebhookDocumentPayload>[0];

    const payload = mapEnvelopeToWebhookDocumentPayload(envelope);

    expect(payload.id).toBe(42);
    expect(payload.envelopeId).toBe('envelope_test');
    expect(ZWebhookDocumentSchema.parse(payload).envelopeId).toBe('envelope_test');
  });
});
