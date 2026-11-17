import type { LatestEnvelopeActivityCategory } from '@documenso/lib/types/latest-envelope-activity';
import { formatDocumentAuditLogAction } from '@documenso/lib/utils/document-audit-logs';
import { trpc } from '@documenso/trpc/react';
import { cn } from '@documenso/ui/lib/utils';
import { Button } from '@documenso/ui/primitives/button';
import { Popover, PopoverContent, PopoverTrigger } from '@documenso/ui/primitives/popover';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans, useLingui as useLinguiMacro } from '@lingui/react/macro';
import { keepPreviousData } from '@tanstack/react-query';
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  BellIcon,
  CheckCheckIcon,
  EyeIcon,
  MailIcon,
  SendIcon,
} from 'lucide-react';
import { DateTime } from 'luxon';
import { useRef, useState } from 'react';
import { Link } from 'react-router';

import { useEnvelopeActivityReadState } from '~/hooks/use-envelope-activity-read-state';

type LatestEnvelopeActivityProps = {
  userId: number;
  teamId: number;
  teamUrl: string;
};

const ACTIVITY_REFRESH_INTERVAL_MS = 30_000;

export const activityCategories = {
  sent: { label: msg`Sent`, Icon: SendIcon },
  opened: { label: msg`Opened`, Icon: EyeIcon },
  reminder: { label: msg`Reminders`, Icon: MailIcon },
  completed: { label: msg`Completed`, Icon: CheckCheckIcon },
  declined: { label: msg`Declined`, Icon: AlertTriangleIcon },
  deliveryFailure: { label: msg`Delivery issues`, Icon: AlertCircleIcon },
} satisfies Record<LatestEnvelopeActivityCategory, { label: ReturnType<typeof msg>; Icon: typeof BellIcon }>;

export const LatestEnvelopeActivity = ({ userId, teamId, teamUrl }: LatestEnvelopeActivityProps) => {
  const { _, i18n } = useLingui();
  const { t } = useLinguiMacro();
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState<LatestEnvelopeActivityCategory>();
  const { readActivity, markRead } = useEnvelopeActivityReadState({ userId, teamId });
  const isFollowingActivityLink = useRef(false);

  const { data: notifications } = trpc.envelope.activity.getNotifications.useQuery(
    { teamId },
    { enabled: readActivity !== undefined, refetchInterval: ACTIVITY_REFRESH_INTERVAL_MS },
  );

  const { data, isError, isPlaceholderData, refetch } = trpc.envelope.activity.getLatest.useQuery(
    { teamId, category, page: 1, perPage: 10 },
    { enabled: isOpen, placeholderData: keepPreviousData, refetchInterval: ACTIVITY_REFRESH_INTERVAL_MS },
  );

  const unreadIds = new Set(notifications?.ids.filter((id) => !readActivity?.[id]));
  const items = isPlaceholderData ? undefined : data?.items;

  const onOpenChange = (open: boolean) => {
    setIsOpen(open);

    if (!open) {
      setCategory(undefined);
    }
  };

  const selectCategory = (nextCategory: LatestEnvelopeActivityCategory | undefined) => {
    setCategory(nextCategory);
  };

  const newCount = unreadIds.size;
  const badgeText = newCount > 99 ? '99+' : String(newCount);

  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={newCount > 0 ? t`Latest activity (${badgeText} new)` : t`Latest activity`}
          title={t`Latest activity`}
          className="relative h-10 w-10 shrink-0 rounded-lg p-0 text-muted-foreground"
        >
          <BellIcon className="h-5 w-5" aria-hidden="true" />
          {newCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-0.5 font-semibold text-[10px] text-primary-foreground"
            >
              {badgeText}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={10}
        collisionPadding={12}
        aria-label={t`Latest activity`}
        onCloseAutoFocus={(event) => {
          if (isFollowingActivityLink.current) {
            event.preventDefault();
            isFollowingActivityLink.current = false;
          }
        }}
        className="z-[70] flex max-h-[var(--radix-popover-content-available-height)] w-[min(34rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg p-0"
      >
        <div className="border-b p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">
              <Trans>Latest activity</Trans>
            </h2>
            <span className="text-muted-foreground text-xs">
              <Trans>Last 24 hours</Trans>
            </span>
          </div>

          {(data?.summary ?? []).some(({ count }) => count > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <ActivityFilter isSelected={!category} onClick={() => selectCategory(undefined)}>
                <Trans>All</Trans>
              </ActivityFilter>

              {data?.summary
                .filter((entry) => entry.count > 0 || entry.category === category)
                .map(({ category: itemCategory, count }) => (
                  <ActivityFilter
                    key={itemCategory}
                    isSelected={category === itemCategory}
                    onClick={() => selectCategory(category === itemCategory ? undefined : itemCategory)}
                  >
                    <span className="tabular-nums">{count}</span>
                    {_(activityCategories[itemCategory].label)}
                  </ActivityFilter>
                ))}
            </div>
          )}
        </div>

        <div key={category ?? 'all'} className="min-h-0 overflow-y-auto">
          {isError && (
            <div className="px-4 py-6 text-center text-muted-foreground text-sm">
              <p>
                <Trans>Unable to load document history</Trans>
              </p>
              <Button type="button" variant="link" onClick={() => void refetch()}>
                <Trans>Click here to retry</Trans>
              </Button>
            </div>
          )}

          {!items && !isError && (
            <p role="status" className="px-4 py-6 text-center text-muted-foreground text-sm">
              <Trans>Loading...</Trans>
            </p>
          )}

          {items?.length === 0 && (
            <p className="px-4 py-6 text-center text-muted-foreground text-sm">
              <Trans>No recent activity</Trans>
            </p>
          )}

          {items && items.length > 0 && (
            <ul className="divide-y">
              {items.map(({ auditLog, category, envelopeTitle }) => {
                const { Icon } = activityCategories[category];
                const isUnread = unreadIds.has(auditLog.id);
                const createdAt = DateTime.fromJSDate(auditLog.createdAt).setLocale(i18n.locale);

                return (
                  <li key={auditLog.id}>
                    <Link
                      to={`/t/${teamUrl}/documents/${auditLog.envelopeId}#recent-activity`}
                      className={cn(
                        'flex items-start gap-2.5 px-4 py-3 hover:bg-muted focus-visible:bg-muted',
                        isUnread && 'bg-primary/10',
                      )}
                      onClick={(event) => {
                        markRead(auditLog.id);

                        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                          return;
                        }

                        isFollowingActivityLink.current = true;
                        onOpenChange(false);
                      }}
                    >
                      <Icon
                        aria-hidden="true"
                        className={cn('mt-0.5 h-4 w-4 shrink-0 text-muted-foreground', {
                          'text-destructive': category === 'deliveryFailure' || category === 'declined',
                        })}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {isUnread && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary">
                              <span className="sr-only">
                                <Trans>Unread</Trans>
                              </span>
                            </span>
                          )}
                          <p className="truncate font-medium text-sm">{envelopeTitle}</p>
                        </div>
                        <p className="break-words text-muted-foreground text-xs">
                          {formatDocumentAuditLogAction(i18n, auditLog, userId).description}
                        </p>
                      </div>
                      <time
                        dateTime={auditLog.createdAt.toISOString()}
                        title={createdAt.toLocaleString(DateTime.DATETIME_MED)}
                        className="shrink-0 whitespace-nowrap text-muted-foreground text-xs"
                      >
                        {createdAt.toRelative({ style: 'short' })}
                      </time>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t p-2">
          <Button asChild variant="ghost" className="w-full">
            <Link
              to={`/t/${teamUrl}/activity${category ? `?category=${category}` : ''}`}
              onClick={() => {
                isFollowingActivityLink.current = true;
                onOpenChange(false);
              }}
            >
              <Trans>View all activity</Trans>
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const ActivityFilter = ({
  isSelected,
  onClick,
  children,
}: {
  isSelected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <Button
    type="button"
    variant={isSelected ? 'secondary' : 'outline'}
    aria-pressed={isSelected}
    onClick={onClick}
    className="h-auto gap-1 rounded-md px-2 py-0.5 text-xs"
  >
    {children}
  </Button>
);
