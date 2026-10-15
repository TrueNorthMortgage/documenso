import { useSession } from '@documenso/lib/client-only/providers/session';
import type { TDocumentMany as TDocumentRow } from '@documenso/lib/types/document';
import { hasEmailDeliveryWarning } from '@documenso/lib/universal/email-delivery';
import { findRecipientByEmail } from '@documenso/lib/utils/recipients';
import { formatDocumentsPath } from '@documenso/lib/utils/teams';
import { Tooltip, TooltipContent, TooltipTrigger } from '@documenso/ui/primitives/tooltip';
import { Trans } from '@lingui/react/macro';
import { DocumentStatus } from '@prisma/client';
import { AlertTriangleIcon } from 'lucide-react';
import { Link } from 'react-router';
import { match } from 'ts-pattern';

import { useCurrentTeam } from '~/providers/team';

export type DataTableTitleProps = {
  row: TDocumentRow;
  teamUrl: string;
};

export const DataTableTitle = ({ row, teamUrl }: DataTableTitleProps) => {
  const { user } = useSession();
  const team = useCurrentTeam();

  const recipient = findRecipientByEmail({
    recipients: row.recipients,
    userEmail: user.email,
    teamEmail: team.teamEmail?.email,
  });

  const isOwner = row.user.id === user.id;
  const isRecipient = !!recipient;
  const isCurrentTeamDocument = teamUrl && row.team?.url === teamUrl;

  const documentsPath = formatDocumentsPath(teamUrl);

  const title = match({
    isOwner,
    isRecipient,
    isCurrentTeamDocument,
  })
    .with({ isOwner: true }, { isCurrentTeamDocument: true }, () => (
      <Link
        to={`${documentsPath}/${row.envelopeId}`}
        title={row.title}
        className="block max-w-[10rem] truncate font-medium hover:underline md:max-w-[20rem]"
      >
        {row.title}
      </Link>
    ))
    .with({ isRecipient: true }, () => (
      <Link
        to={`/sign/${recipient?.token}`}
        title={row.title}
        className="block max-w-[10rem] truncate font-medium hover:underline md:max-w-[20rem]"
      >
        {row.title}
      </Link>
    ))
    .otherwise(() => (
      <span className="block max-w-[10rem] truncate font-medium hover:underline md:max-w-[20rem]">{row.title}</span>
    ));

  const hasDeliveryWarning =
    row.status === DocumentStatus.PENDING &&
    !row.deletedAt &&
    (isOwner || isCurrentTeamDocument) &&
    row.recipients.some(hasEmailDeliveryWarning);

  return (
    <div className="flex items-center gap-2">
      {title}
      {hasDeliveryWarning && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Link to={`${documentsPath}/${row.envelopeId}`} className="shrink-0 text-amber-700 dark:text-amber-400">
              <AlertTriangleIcon className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">
                <Trans>An invitation could not be delivered.</Trans>
              </span>
            </Link>
          </TooltipTrigger>
          <TooltipContent>
            <Trans>An invitation could not be delivered. Check the recipients for details.</Trans>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};
