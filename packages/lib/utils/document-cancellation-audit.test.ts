import type { I18n } from '@lingui/core';
import { describe, expect, it, vi } from 'vitest';

import { DOCUMENT_AUDIT_LOG_TYPE, ZDocumentAuditLogEventDocumentDeletedSchema } from '../types/document-audit-logs';
import { formatDocumentAuditLogAction } from './document-audit-logs';

vi.mock('@lingui/core/macro', () => ({
  msg: (message: TemplateStringsArray | { message: string }, ...values: unknown[]) =>
    Array.isArray(message)
      ? message.reduce((result, part, index) => result + part + (values[index] ?? ''), '')
      : (message as { message: string }).message,
}));
const i18n = { _: (message: string) => message } as unknown as I18n;

describe('cancellation audit history', () => {
  it('keeps existing deletion events valid without a message', () => {
    expect(
      ZDocumentAuditLogEventDocumentDeletedSchema.parse({ type: 'DOCUMENT_DELETED', data: { type: 'HARD' } }).data,
    ).toEqual({ type: 'HARD' });
  });

  it.each([undefined, 1, 2])('includes the message for each viewer: %s', (viewerId) => {
    const log = {
      id: 'audit',
      envelopeId: null,
      createdAt: new Date(),
      type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_DELETED,
      data: { type: 'HARD' as const, cancellationReason: 'Please use the updated package.' },
      userId: 1,
      name: 'Sender',
      email: 'sender@example.com',
      ipAddress: null,
      userAgent: null,
    };
    expect(formatDocumentAuditLogAction(i18n, log, viewerId).description).toContain('Please use the updated package.');
  });
});
