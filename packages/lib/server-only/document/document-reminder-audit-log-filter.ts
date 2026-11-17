import type { Prisma } from '@prisma/client';

import { DOCUMENT_AUDIT_LOG_TYPE, DOCUMENT_EMAIL_TYPE } from '../../types/document-audit-logs';

export const automaticReminderAuditLogFilter = {
  type: DOCUMENT_AUDIT_LOG_TYPE.EMAIL_SENT,
  data: { path: ['emailType'], equals: DOCUMENT_EMAIL_TYPE.REMINDER },
} satisfies Prisma.DocumentAuditLogWhereInput;

export const resentEmailAuditLogFilter = {
  type: DOCUMENT_AUDIT_LOG_TYPE.EMAIL_SENT,
  data: { path: ['isResending'], equals: true },
} satisfies Prisma.DocumentAuditLogWhereInput;
