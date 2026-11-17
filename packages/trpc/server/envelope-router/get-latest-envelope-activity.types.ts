import { ZDocumentAuditLogSchema } from '@documenso/lib/types/document-audit-logs';
import { ZLatestEnvelopeActivityCategorySchema } from '@documenso/lib/types/latest-envelope-activity';
import { z } from 'zod';

export const ZGetLatestEnvelopeActivityRequestSchema = z.object({
  teamId: z.number().int().positive(),
  category: ZLatestEnvelopeActivityCategorySchema.optional(),
});

export const ZGetLatestEnvelopeActivityResponseSchema = z.object({
  asOf: z.date(),
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
    }),
  ),
});
