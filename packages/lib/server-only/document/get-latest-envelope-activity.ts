import { prisma } from '@documenso/prisma';
import { EnvelopeType, type Prisma } from '@prisma/client';

import { DOCUMENT_AUDIT_LOG_TYPE, ZDocumentAuditLogSchema } from '../../types/document-audit-logs';
import {
  type LatestEnvelopeActivityCategory,
  ZLatestEnvelopeActivityCategorySchema,
} from '../../types/latest-envelope-activity';
import { EMAIL_DELIVERY_FAILURE_STATUSES } from '../../universal/email-delivery';
import { getTeamById } from '../team/get-team';
import { automaticReminderAuditLogFilter, resentEmailAuditLogFilter } from './document-reminder-audit-log-filter';

const ACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000;
const ACTIVITY_LIST_LIMIT = 20;

const activityFilters = {
  sent: { type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_SENT },
  opened: {
    type: { in: [DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_OPENED, DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_PREVIEW_OPENED] },
  },
  reminder: { OR: [automaticReminderAuditLogFilter, resentEmailAuditLogFilter] },
  completed: { type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_COMPLETED },
  declined: { type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_RECIPIENT_REJECTED },
  deliveryFailure: {
    type: {
      in: [
        DOCUMENT_AUDIT_LOG_TYPE.EMAIL_DELIVERY_UPDATED,
        DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_PREVIEW_EMAIL_DELIVERY_UPDATED,
      ],
    },
    OR: EMAIL_DELIVERY_FAILURE_STATUSES.map((status) => ({ data: { path: ['status'], equals: status } })),
  },
} satisfies Record<LatestEnvelopeActivityCategory, Prisma.DocumentAuditLogWhereInput>;

const categoryByLogType: Partial<Record<string, LatestEnvelopeActivityCategory>> = {
  [DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_SENT]: 'sent',
  [DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_OPENED]: 'opened',
  [DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_PREVIEW_OPENED]: 'opened',
  [DOCUMENT_AUDIT_LOG_TYPE.EMAIL_SENT]: 'reminder',
  [DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_COMPLETED]: 'completed',
  [DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_RECIPIENT_REJECTED]: 'declined',
  [DOCUMENT_AUDIT_LOG_TYPE.EMAIL_DELIVERY_UPDATED]: 'deliveryFailure',
  [DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_PREVIEW_EMAIL_DELIVERY_UPDATED]: 'deliveryFailure',
};

type ActivityScope = {
  userId: number;
  teamId: number;
};

export const countNewEnvelopeActivity = async ({
  userId,
  teamId,
  seenThrough,
}: ActivityScope & { seenThrough?: Date }) => {
  const { where } = await getActivityScope({ userId, teamId });

  return {
    count: await prisma.documentAuditLog.count({
      where: {
        ...where,
        AND: seenThrough ? { createdAt: { gt: seenThrough } } : undefined,
      },
    }),
  };
};

export const getLatestEnvelopeActivity = async ({
  userId,
  teamId,
  category,
}: ActivityScope & { category?: LatestEnvelopeActivityCategory }) => {
  const { where, asOf } = await getActivityScope({ userId, teamId });

  const [groups, entries] = await Promise.all([
    prisma.documentAuditLog.groupBy({
      by: ['type'],
      _count: { _all: true },
      where,
    }),
    prisma.documentAuditLog.findMany({
      where: { ...where, AND: category ? activityFilters[category] : undefined },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: ACTIVITY_LIST_LIMIT,
      select: {
        id: true,
        envelopeId: true,
        createdAt: true,
        type: true,
        data: true,
        name: true,
        email: true,
        userId: true,
        envelope: { select: { title: true } },
      },
    }),
  ]);

  const summary = ZLatestEnvelopeActivityCategorySchema.options.map((category) => ({
    category,
    count: groups.reduce(
      (count, group) => count + (categoryByLogType[group.type] === category ? group._count._all : 0),
      0,
    ),
  }));

  const items = entries.flatMap(({ envelope, ...entry }) => {
    const category = categoryByLogType[entry.type];
    const auditLog = ZDocumentAuditLogSchema.safeParse(entry);

    if (!envelope || !category || !auditLog.success) {
      return [];
    }

    return [{ envelopeTitle: envelope.title, category, auditLog: auditLog.data }];
  });

  return { asOf, summary, items };
};

const getActivityScope = async ({ userId, teamId }: ActivityScope) => {
  const team = await getTeamById({ userId, teamId });
  const asOf = new Date();

  const where: Prisma.DocumentAuditLogWhereInput = {
    createdAt: { gte: new Date(asOf.getTime() - ACTIVITY_WINDOW_MS), lte: asOf },
    envelope: { teamId: team.id, userId, type: EnvelopeType.DOCUMENT, deletedAt: null },
    OR: Object.values(activityFilters),
  };

  return { where, asOf };
};
