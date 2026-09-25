import { getSession } from '@documenso/auth/server/lib/utils/get-session';
import {
  getEnvelopeReport,
  type ReportBucket,
  type ReportRange,
} from '@documenso/lib/server-only/reports/get-envelope-report';
import { msg } from '@lingui/core/macro';
import { EnvelopeReportsDashboard } from '~/components/general/reports/envelope-reports-dashboard';
import { SettingsHeader } from '~/components/general/settings-header';

import type { Route } from './+types/settings.reports';

const ranges = ['7d', '30d', '90d', '365d', 'calendar-year'] as const;
const buckets = ['day', 'week', 'month'] as const;

export function meta() {
  return [{ title: msg`Reports` }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const { user } = await getSession(request);
  const searchParams = new URL(request.url).searchParams;
  const range = ranges.includes(searchParams.get('range') as ReportRange)
    ? (searchParams.get('range') as ReportRange)
    : '30d';
  const bucket = buckets.includes(searchParams.get('bucket') as ReportBucket)
    ? (searchParams.get('bucket') as ReportBucket)
    : 'day';
  const teamId = Number(searchParams.get('teamId')) || undefined;
  return { report: await getEnvelopeReport({ userId: user.id, teamUrl: params.teamUrl, range, bucket, teamId }) };
}

export default function TeamReportsPage({ loaderData }: Route.ComponentProps) {
  return (
    <div>
      <SettingsHeader
        title="Reports"
        subtitle="Understand envelope activity, completion, and turnaround across your team."
      />
      <EnvelopeReportsDashboard report={loaderData.report} />
    </div>
  );
}
