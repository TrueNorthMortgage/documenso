import { prisma } from '@documenso/prisma';
import { DocumentStatus, EnvelopeType, ReadStatus, SendStatus, SigningStatus } from '@prisma/client';
import { TEAM_DOCUMENT_VISIBILITY_MAP } from '../../constants/teams';
import { AppError, AppErrorCode } from '../../errors/app-error';
import { canExecuteOrganisationAction } from '../../utils/organisations';
import { canExecuteTeamAction } from '../../utils/teams';
import { getMemberOrganisationRole } from '../team/get-member-roles';
import { getTeamByUrl } from '../team/get-team';

export type ReportRange = '7d' | '30d' | '90d' | '365d' | 'calendar-year';
export type ReportBucket = 'day' | 'week' | 'month';

type GetEnvelopeReportOptions = {
  userId: number;
  teamUrl: string;
  range: ReportRange;
  bucket: ReportBucket;
  teamId?: number;
};

const rangeInDays: Record<Exclude<ReportRange, 'calendar-year'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '365d': 365,
};

const getBucketKey = (date: Date, bucket: ReportBucket) => {
  const value = new Date(date);

  if (bucket === 'month') {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  if (bucket === 'week') {
    const day = value.getUTCDay() || 7;
    value.setUTCDate(value.getUTCDate() - day + 1);
  }

  return value.toISOString().slice(0, 10);
};

const getBucketDate = (key: string, bucket: ReportBucket) => {
  if (bucket === 'month') {
    return new Date(`${key}-01T00:00:00.000Z`);
  }

  return new Date(`${key}T00:00:00.000Z`);
};

export const getEnvelopeReport = async ({ userId, teamUrl, range, bucket, teamId }: GetEnvelopeReportOptions) => {
  const currentTeam = await getTeamByUrl({ userId, teamUrl });

  const organisationRole = await getMemberOrganisationRole({
    organisationId: currentTeam.organisationId,
    reference: { type: 'User', id: userId },
  });
  const canViewOrganisation = canExecuteOrganisationAction('MANAGE_ORGANISATION', organisationRole);

  if (!canExecuteTeamAction('MANAGE_TEAM', currentTeam.currentTeamRole) && !canViewOrganisation) {
    throw new AppError(AppErrorCode.UNAUTHORIZED, { message: 'You are not allowed to view reports.' });
  }

  if (teamId && teamId !== currentTeam.id && !canViewOrganisation) {
    throw new AppError(AppErrorCode.UNAUTHORIZED, { message: 'You are not allowed to view this team.' });
  }

  const teams = await prisma.team.findMany({
    where: { organisationId: currentTeam.organisationId },
    select: { id: true, name: true, url: true },
    orderBy: { name: 'asc' },
  });
  const scopedTeamId = canViewOrganisation ? teamId : currentTeam.id;
  const startDate = new Date();

  if (range === 'calendar-year') {
    startDate.setUTCMonth(0, 1);
    startDate.setUTCHours(0, 0, 0, 0);
  } else {
    startDate.setUTCDate(startDate.getUTCDate() - rangeInDays[range]);
    startDate.setUTCHours(0, 0, 0, 0);
  }

  const envelopes = await prisma.envelope.findMany({
    where: {
      type: EnvelopeType.DOCUMENT,
      deletedAt: null,
      createdAt: { gte: startDate },
      team: {
        organisationId: currentTeam.organisationId,
        ...(scopedTeamId ? { id: scopedTeamId } : {}),
      },
      ...(!canViewOrganisation
        ? { visibility: { in: TEAM_DOCUMENT_VISIBILITY_MAP[currentTeam.currentTeamRole] } }
        : {}),
    },
    select: {
      createdAt: true,
      completedAt: true,
      status: true,
      title: true,
      templateId: true,
      user: { select: { id: true, name: true, email: true } },
      recipients: { select: { sendStatus: true, readStatus: true, signingStatus: true } },
    },
  });

  const buckets = new Map<string, Record<DocumentStatus, number>>();
  const senders = new Map<
    string,
    { id: number; name: string; count: number; completed: number; inProgress: number; rejected: number }
  >();
  let completedTurnaroundHours = 0;
  let completedWithTurnaround = 0;
  const recipientFunnel = { total: 0, sent: 0, opened: 0, signed: 0, declined: 0 };
  const turnaroundDistribution = { sameDay: 0, oneToThreeDays: 0, fourToSevenDays: 0, overSevenDays: 0 };
  const templates = new Map<string, { name: string; count: number; completed: number }>();
  const totals = { DRAFT: 0, PENDING: 0, COMPLETED: 0, REJECTED: 0 };

  for (const envelope of envelopes) {
    const key = getBucketKey(envelope.createdAt, bucket);
    const counts = buckets.get(key) ?? { DRAFT: 0, PENDING: 0, COMPLETED: 0, REJECTED: 0 };
    counts[envelope.status] += 1;
    buckets.set(key, counts);
    totals[envelope.status] += 1;

    const sender = envelope.user.name || envelope.user.email;
    const senderStats = senders.get(envelope.user.email) ?? {
      id: envelope.user.id,
      name: sender,
      count: 0,
      completed: 0,
      inProgress: 0,
      rejected: 0,
    };
    senderStats.count += 1;

    if (envelope.status === DocumentStatus.COMPLETED) {
      senderStats.completed += 1;
    }

    if (envelope.status === DocumentStatus.PENDING) {
      senderStats.inProgress += 1;
    }

    if (envelope.status === DocumentStatus.REJECTED) {
      senderStats.rejected += 1;
    }

    senders.set(envelope.user.email, senderStats);

    if (envelope.templateId) {
      const templateKey = envelope.templateId.toString();
      const templateStats = templates.get(templateKey) ?? { name: envelope.title, count: 0, completed: 0 };
      templateStats.count += 1;
      templateStats.completed += envelope.status === DocumentStatus.COMPLETED ? 1 : 0;
      templates.set(templateKey, templateStats);
    }

    for (const recipient of envelope.recipients) {
      recipientFunnel.total += 1;
      recipientFunnel.sent += recipient.sendStatus === SendStatus.SENT ? 1 : 0;
      recipientFunnel.opened += recipient.readStatus === ReadStatus.OPENED ? 1 : 0;
      recipientFunnel.signed += recipient.signingStatus === SigningStatus.SIGNED ? 1 : 0;
      recipientFunnel.declined += recipient.signingStatus === SigningStatus.REJECTED ? 1 : 0;
    }

    if (envelope.completedAt) {
      const turnaroundHours = (envelope.completedAt.getTime() - envelope.createdAt.getTime()) / 3_600_000;
      completedTurnaroundHours += turnaroundHours;
      completedWithTurnaround += 1;

      if (turnaroundHours < 24) {
        turnaroundDistribution.sameDay += 1;
      } else if (turnaroundHours <= 72) {
        turnaroundDistribution.oneToThreeDays += 1;
      } else if (turnaroundHours <= 168) {
        turnaroundDistribution.fourToSevenDays += 1;
      } else {
        turnaroundDistribution.overSevenDays += 1;
      }
    }
  }

  const sent = totals.PENDING + totals.COMPLETED + totals.REJECTED;
  const chartData = [...buckets.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([key, counts]) => ({
      label: getBucketDate(key, bucket).toLocaleDateString('en-US', {
        month: 'short',
        day: bucket === 'month' ? undefined : 'numeric',
        year: bucket === 'month' ? '2-digit' : undefined,
        timeZone: 'UTC',
      }),
      ...counts,
    }));

  return {
    teams: canViewOrganisation ? teams : teams.filter((team) => team.id === currentTeam.id),
    canViewOrganisation,
    selectedTeamId: scopedTeamId ?? null,
    range,
    bucket,
    metrics: {
      total: envelopes.length,
      completed: totals.COMPLETED,
      inProgress: totals.PENDING,
      rejected: totals.REJECTED,
      activeSenders: senders.size,
      completionRate: sent === 0 ? 0 : Math.round((totals.COMPLETED / sent) * 1000) / 10,
      averageTurnaroundHours: completedWithTurnaround === 0 ? 0 : completedTurnaroundHours / completedWithTurnaround,
    },
    chartData,
    recipientFunnel,
    turnaroundDistribution: [
      { label: 'Same day', count: turnaroundDistribution.sameDay },
      { label: '1-3 days', count: turnaroundDistribution.oneToThreeDays },
      { label: '4-7 days', count: turnaroundDistribution.fourToSevenDays },
      { label: '7+ days', count: turnaroundDistribution.overSevenDays },
    ],
    slowestEnvelopes: envelopes
      .filter((envelope) => envelope.status === DocumentStatus.PENDING)
      .sort((first, second) => first.createdAt.getTime() - second.createdAt.getTime())
      .slice(0, 5)
      .map((envelope) => ({
        title: envelope.title,
        ageInDays: Math.max(1, Math.floor((Date.now() - envelope.createdAt.getTime()) / 86_400_000)),
      })),
    templateEffectiveness: [...templates.entries()]
      .sort(([, first], [, second]) => second.count - first.count)
      .slice(0, 5)
      .map(([, stats]) => ({
        name: stats.name,
        count: stats.count,
        completionRate: stats.count === 0 ? 0 : Math.round((stats.completed / stats.count) * 100),
      })),
    topSenders: [...senders.entries()]
      .sort(([, first], [, second]) => second.count - first.count)
      .slice(0, 5)
      .map(([, stats]) => stats),
  };
};
