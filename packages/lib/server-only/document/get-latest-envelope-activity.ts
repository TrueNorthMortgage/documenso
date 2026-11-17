import { prisma } from '@documenso/prisma';
import { EnvelopeType, type Prisma, RecipientRole } from '@prisma/client';

import { DOCUMENT_AUDIT_LOG_TYPE, ZDocumentAuditLogSchema } from '../../types/document-audit-logs';
import {
  type LatestEnvelopeActivityCategory,
  ZLatestEnvelopeActivityCategorySchema,
} from '../../types/latest-envelope-activity';
import { EMAIL_DELIVERY_FAILURE_STATUSES } from '../../universal/email-delivery';
import { getTeamById } from '../team/get-team';
import { automaticReminderAuditLogFilter, resentEmailAuditLogFilter } from './document-reminder-audit-log-filter';

const ACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000;

const signerCompletedFilter = {
  type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_RECIPIENT_COMPLETED,
  data: { path: ['recipientRole'], equals: RecipientRole.SIGNER },
} satisfies Prisma.DocumentAuditLogWhereInput;

const activityFilters = {
  sent: { type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_SENT },
  opened: {
    type: { in: [DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_OPENED, DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_PREVIEW_OPENED] },
  },
  reminder: { OR: [automaticReminderAuditLogFilter, resentEmailAuditLogFilter] },
  completed: {
    OR: [{ type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_COMPLETED }, signerCompletedFilter],
  },
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
  [DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_RECIPIENT_COMPLETED]: 'completed',
  [DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_RECIPIENT_REJECTED]: 'declined',
  [DOCUMENT_AUDIT_LOG_TYPE.EMAIL_DELIVERY_UPDATED]: 'deliveryFailure',
  [DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_PREVIEW_EMAIL_DELIVERY_UPDATED]: 'deliveryFailure',
};

type ActivityScope = {
  userId: number;
  teamId: number;
};

export const getEnvelopeActivityNotifications = async ({
  userId,
  userEmail,
  teamId,
}: ActivityScope & { userEmail: string }) => {
  const where = await getActivityScope({ userId, teamId });
  const notifications = await prisma.documentAuditLog.findMany({
    where: {
      ...where,
      ...getNotificationFilter({ userId, userEmail }),
    },
    select: { id: true },
  });

  return { ids: notifications.map(({ id }) => id) };
};

export const getLatestEnvelopeActivity = async ({
  userId,
  teamId,
  category,
  page,
  perPage,
  period,
  query,
  unreadOnly,
  readIds,
  userEmail,
}: ActivityScope & {
  category?: LatestEnvelopeActivityCategory;
  page: number;
  perPage: number;
  period: 'day' | 'week' | 'month' | 'all';
  query: string;
  unreadOnly: boolean;
  readIds: string[];
  userEmail: string;
}) => {
  const where = {
    ...(await getActivityScope({ userId, teamId, period, query })),
    OR: Object.values(activityFilters),
    AND: unreadOnly ? getNotificationFilter({ userId, userEmail }) : undefined,
    id: unreadOnly ? { notIn: readIds } : undefined,
  } satisfies Prisma.DocumentAuditLogWhereInput;
  const filteredWhere = {
    ...where,
    AND: [
      ...(unreadOnly ? [getNotificationFilter({ userId, userEmail })] : []),
      ...(category ? [activityFilters[category]] : []),
    ],
  };

  const [groups, total, entries] = await Promise.all([
    prisma.documentAuditLog.groupBy({
      by: ['type'],
      orderBy: { type: 'asc' },
      _count: { _all: true },
      where,
    }),
    prisma.documentAuditLog.count({ where: filteredWhere }),
    prisma.documentAuditLog.findMany({
      where: filteredWhere,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * perPage,
      take: perPage,
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

    return [
      {
        envelopeTitle: envelope.title,
        category,
        auditLog: auditLog.data,
        isNotification:
          category === 'deliveryFailure' ||
          ((entry.type === DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_RECIPIENT_COMPLETED || category === 'declined') &&
            entry.userId !== userId &&
            entry.email?.toLowerCase() !== userEmail.toLowerCase()),
      },
    ];
  });

  return { pageSize: perPage, total, summary, items };
};

const getActivityScope = async ({
  userId,
  teamId,
  period = 'day',
  query,
}: ActivityScope & {
  period?: 'day' | 'week' | 'month' | 'all';
  query?: string;
}): Promise<Prisma.DocumentAuditLogWhereInput> => {
  const team = await getTeamById({ userId, teamId });
  const asOf = new Date();

  return {
    createdAt: {
      gte:
        period === 'all'
          ? undefined
          : new Date(asOf.getTime() - ACTIVITY_WINDOW_MS * { day: 1, week: 7, month: 30 }[period]),
      lte: asOf,
    },
    envelope: {
      teamId: team.id,
      userId,
      type: EnvelopeType.DOCUMENT,
      deletedAt: null,
      title: query?.trim() ? { contains: query.trim(), mode: 'insensitive' } : undefined,
    },
  };
};

const getNotificationFilter = ({
  userId,
  userEmail,
}: {
  userId: number;
  userEmail: string;
}): Prisma.DocumentAuditLogWhereInput => ({
  // The final signature also seals the envelope. Only the signature counts toward the badge.
  OR: [
    {
      AND: [
        { OR: [signerCompletedFilter, activityFilters.declined] },
        { OR: [{ userId: null }, { userId: { not: userId } }] },
        { OR: [{ email: null }, { email: { not: userEmail, mode: 'insensitive' } }] },
      ],
    },
    activityFilters.deliveryFailure,
  ],
});
