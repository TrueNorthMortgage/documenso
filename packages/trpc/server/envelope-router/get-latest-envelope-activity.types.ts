import { ZDocumentAuditLogSchema } from '@documenso/lib/types/document-audit-logs';
import { ZLatestEnvelopeActivityCategorySchema } from '@documenso/lib/types/latest-envelope-activity';
import { z } from 'zod';

export const ZGetLatestEnvelopeActivityRequestSchema = z.object({
  teamId: z.number().int().positive(),
  category: ZLatestEnvelopeActivityCategorySchema.optional(),
  page: z.number().int().min(1).max(100_000).default(1),
  perPage: z.number().int().min(1).max(50).default(10),
  period: z.enum(['day', 'week', 'month', 'all']).default('day'),
  query: z.string().max(200).default(''),
  unreadOnly: z.boolean().default(false),
  readIds: z.string().array().default([]),
});

export const ZGetLatestEnvelopeActivityResponseSchema = z.object({
  pageSize: z.number(),
  total: z.number(),
  summary: z.array(
    z.object({
      category: ZLatestEnvelopeActivityCategorySchema,
      count: z.number(),
    }),
  ),
  items: z.array(
    z.object({
      envelopeTitle: z.string(),
      category: ZLatestEnvelopeActivityCategorySchema,
      auditLog: ZDocumentAuditLogSchema,
      isNotification: z.boolean(),
    }),
  ),
});
