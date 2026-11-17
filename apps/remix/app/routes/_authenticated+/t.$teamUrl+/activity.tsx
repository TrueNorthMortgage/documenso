import { useSession } from '@documenso/lib/client-only/providers/session';
import { ZLatestEnvelopeActivityCategorySchema } from '@documenso/lib/types/latest-envelope-activity';
import { formatDocumentAuditLogAction } from '@documenso/lib/utils/document-audit-logs';
import { trpc } from '@documenso/trpc/react';
import { cn } from '@documenso/ui/lib/utils';
import { Button } from '@documenso/ui/primitives/button';
import { Checkbox } from '@documenso/ui/primitives/checkbox';
import { DataTablePagination } from '@documenso/ui/primitives/data-table-pagination';
import { Input } from '@documenso/ui/primitives/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@documenso/ui/primitives/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@documenso/ui/primitives/table';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans, useLingui as useLinguiMacro } from '@lingui/react/macro';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { DateTime } from 'luxon';
import { Link, useSearchParams } from 'react-router';
import { z } from 'zod';

import { activityCategories } from '~/components/general/latest-envelope-activity';
import { useEnvelopeActivityReadState } from '~/hooks/use-envelope-activity-read-state';
import { useCurrentTeam } from '~/providers/team';
import { appMetaTags } from '~/utils/meta';

export const meta = () => appMetaTags(msg`Latest activity`);

export default function ActivityPage() {
  const team = useCurrentTeam();

  return <TeamActivityPage key={team.id} teamId={team.id} teamUrl={team.url} />;
}

const TeamActivityPage = ({ teamId, teamUrl }: { teamId: number; teamUrl: string }) => {
  const { _, i18n } = useLingui();
  const { t } = useLinguiMacro();
  const { user } = useSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isReady, markRead } = useEnvelopeActivityReadState({ userId: user.id, teamId });
  const category = ZLatestEnvelopeActivityCategorySchema.optional()
    .catch(undefined)
    .parse(searchParams.get('category') ?? undefined);
  const period = z.enum(['day', 'week', 'month', 'all']).catch('day').parse(searchParams.get('period'));
  const pageNumber = z.coerce
    .number()
    .int()
    .min(1)
    .max(100_000)
    .catch(1)
    .parse(searchParams.get('page') ?? 1);
  const perPage = z.coerce
    .number()
    .pipe(z.union([z.literal(10), z.literal(20), z.literal(30), z.literal(40), z.literal(50)]))
    .catch(10)
    .parse(searchParams.get('perPage') ?? 10);
  const query = (searchParams.get('query') ?? '').slice(0, 200);
  const unreadOnly = searchParams.get('unread') === 'true';

  const { data, isLoading, isError, refetch } = trpc.envelope.activity.getLatest.useQuery(
    {
      teamId,
      category,
      period,
      page: pageNumber,
      perPage,
      query,
      unreadOnly,
    },
    { enabled: isReady, refetchInterval: 30_000 },
  );

  const updateFilter = (name: string, value: string) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);

        if (value) {
          next.set(name, value);
        } else {
          next.delete(name);
        }

        if (name !== 'page') {
          next.delete('page');
        }

        return next;
      },
      { replace: true },
    );
  };

  const pagination = { pageIndex: pageNumber - 1, pageSize: perPage };
  const table = useReactTable({
    data: data?.items ?? [],
    columns: [],
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil((data?.total ?? 0) / perPage)),
    state: { pagination },
    onPaginationChange: (updater) => {
      const nextPagination = typeof updater === 'function' ? updater(pagination) : updater;

      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.set('page', String(nextPagination.pageIndex + 1));
          next.set('perPage', String(nextPagination.pageSize));
          return next;
        },
        { replace: true },
      );
    },
  });

  return (
    <div className="mx-auto w-full max-w-screen-xl px-4 md:px-8">
      <h1 className="font-semibold text-2xl md:text-3xl">
        <Trans>Latest activity</Trans>
      </h1>

      <div className="my-6 flex flex-wrap items-center gap-3">
        <Input
          aria-label={t`Search envelopes`}
          placeholder={t`Search envelopes`}
          value={query}
          maxLength={200}
          onChange={(event) => updateFilter('query', event.target.value)}
          className="w-full sm:max-w-xs"
        />
        <Select value={period} onValueChange={(value) => updateFilter('period', value)}>
          <SelectTrigger aria-label={t`Date range`} className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">
              <Trans>Last 24 hours</Trans>
            </SelectItem>
            <SelectItem value="week">
              <Trans>Last 7 days</Trans>
            </SelectItem>
            <SelectItem value="month">
              <Trans>Last 30 days</Trans>
            </SelectItem>
            <SelectItem value="all">
              <Trans>All Time</Trans>
            </SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={category ?? 'all'}
          onValueChange={(value) => updateFilter('category', value === 'all' ? '' : value)}
        >
          <SelectTrigger aria-label={t`Event type`} className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              <Trans>All</Trans>
            </SelectItem>
            {ZLatestEnvelopeActivityCategorySchema.options.map((category) => (
              <SelectItem key={category} value={category}>
                {_(activityCategories[category].label)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={unreadOnly}
            onCheckedChange={(checked) => updateFilter('unread', checked === true ? 'true' : '')}
          />
          <Trans>Unread</Trans>
        </label>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Trans>Envelope</Trans>
              </TableHead>
              <TableHead>
                <Trans>Event type</Trans>
              </TableHead>
              <TableHead>
                <Trans>Activity</Trans>
              </TableHead>
              <TableHead>
                <Trans>Date</Trans>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isError && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center">
                  <p>
                    <Trans>Unable to load document history</Trans>
                  </p>
                  <Button type="button" variant="link" onClick={() => void refetch()}>
                    <Trans>Click here to retry</Trans>
                  </Button>
                </TableCell>
              </TableRow>
            )}
            {(isLoading || !isReady) && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center">
                  <Trans>Loading...</Trans>
                </TableCell>
              </TableRow>
            )}
            {data?.items.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center">
                  <Trans>No recent activity</Trans>
                </TableCell>
              </TableRow>
            )}
            {data?.items.map(({ auditLog, category, envelopeTitle, isNotification, isRead }) => {
              const isUnread = isNotification && !isRead;
              const { Icon, label } = activityCategories[category];

              return (
                <TableRow key={auditLog.id} className={cn(isUnread && 'bg-primary/10')}>
                  <TableCell className="max-w-xs">
                    <Link
                      to={`/t/${teamUrl}/documents/${auditLog.envelopeId}#recent-activity`}
                      onClick={() => markRead(auditLog.id)}
                      className="flex items-center gap-2 font-medium hover:underline"
                    >
                      {isUnread && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary">
                          <span className="sr-only">
                            <Trans>Unread</Trans>
                          </span>
                        </span>
                      )}
                      <span className="truncate">{envelopeTitle}</span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      <Icon
                        className={cn(
                          'h-4 w-4 shrink-0 text-muted-foreground',
                          (category === 'deliveryFailure' || category === 'declined') && 'text-destructive',
                        )}
                        aria-hidden="true"
                      />
                      {_(label)}
                    </span>
                  </TableCell>
                  <TableCell truncate={false} className="min-w-60 break-words">
                    {formatDocumentAuditLogAction(i18n, auditLog, user.id).description}
                  </TableCell>
                  <TableCell>
                    <time dateTime={auditLog.createdAt.toISOString()}>
                      {DateTime.fromJSDate(auditLog.createdAt)
                        .setLocale(i18n.locale)
                        .toLocaleString(DateTime.DATETIME_MED)}
                    </time>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="mt-8 w-full">
        <DataTablePagination additionalInformation="VisibleCount" table={table} />
      </div>
    </div>
  );
};
