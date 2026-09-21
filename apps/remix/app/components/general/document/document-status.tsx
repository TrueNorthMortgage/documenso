import type { ExtendedDocumentStatus } from '@documenso/prisma/types/extended-document-status';
import { SignatureIcon } from '@documenso/ui/icons/signature';
import { cn } from '@documenso/ui/lib/utils';
import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { CheckCircle2, Clock, File, FilePenLine, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react/dist/lucide-react';
import { DateTime } from 'luxon';
import type { HTMLAttributes } from 'react';

type FriendlyStatus = {
  label: MessageDescriptor;
  labelExtended: MessageDescriptor;
  icon?: LucideIcon;
  color: string;
};

export const FRIENDLY_STATUS_MAP: Record<ExtendedDocumentStatus, FriendlyStatus> = {
  PENDING: {
    label: msg`Pending`,
    labelExtended: msg`Document pending`,
    icon: Clock,
    color: 'text-blue-600 dark:text-blue-300',
  },
  COMPLETED: {
    label: msg`Completed`,
    labelExtended: msg`Document completed`,
    icon: CheckCircle2,
    color: 'text-green-500 dark:text-green-300',
  },
  DRAFT: {
    label: msg`Draft`,
    labelExtended: msg`Document draft`,
    icon: File,
    color: 'text-yellow-500 dark:text-yellow-200',
  },
  REJECTED: {
    label: msg`Rejected`,
    labelExtended: msg`Document rejected`,
    icon: XCircle,
    color: 'text-red-500 dark:text-red-300',
  },
  INBOX: {
    label: msg`Inbox`,
    labelExtended: msg`Document inbox`,
    icon: SignatureIcon,
    color: 'text-muted-foreground',
  },
  ALL: {
    label: msg`All`,
    labelExtended: msg`Document All`,
    color: 'text-muted-foreground',
  },
};

const CORRECTING_STATUS: FriendlyStatus = {
  label: msg`Correcting`,
  labelExtended: msg`Document being corrected`,
  icon: FilePenLine,
  color: 'text-orange-600 dark:text-orange-300',
};

const SCHEDULED_STATUS: FriendlyStatus = {
  label: msg`Scheduled`,
  labelExtended: msg`Document scheduled`,
  icon: Clock,
  color: 'text-purple-600 dark:text-purple-300',
};

export type DocumentStatusProps = HTMLAttributes<HTMLSpanElement> & {
  status: ExtendedDocumentStatus;
  inheritColor?: boolean;
  isCorrecting?: boolean;
  isScheduled?: boolean;
  scheduledSendAt?: Date | null;
};

export const DocumentStatus = ({
  className,
  status,
  inheritColor,
  isCorrecting,
  isScheduled,
  scheduledSendAt,
  ...props
}: DocumentStatusProps) => {
  const { _, i18n } = useLingui();

  const {
    label,
    icon: Icon,
    color,
  } = isScheduled ? SCHEDULED_STATUS : isCorrecting ? CORRECTING_STATUS : FRIENDLY_STATUS_MAP[status];

  return (
    <span className={cn('flex items-start', className)} {...props}>
      {Icon && (
        <Icon
          className={cn('mt-0.5 mr-2 inline-block h-4 w-4', {
            [color]: !inheritColor,
          })}
        />
      )}
      <span className="flex flex-col">
        <span>{_(label)}</span>
        {isScheduled && scheduledSendAt && (
          <span className="text-muted-foreground text-xs">
            {i18n.date(scheduledSendAt, { ...DateTime.DATETIME_SHORT, hourCycle: 'h12' })}
          </span>
        )}
      </span>
    </span>
  );
};
