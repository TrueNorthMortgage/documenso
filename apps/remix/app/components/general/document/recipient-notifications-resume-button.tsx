import { AppError } from '@documenso/lib/errors/app-error';
import { DOCUMENT_AUDIT_LOG_TYPE, type TDocumentAuditLog } from '@documenso/lib/types/document-audit-logs';
import { canExecuteTeamAction } from '@documenso/lib/utils/teams';
import { trpc } from '@documenso/trpc/react';
import { Button } from '@documenso/ui/primitives/button';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { Trans, useLingui } from '@lingui/react/macro';
import { DocumentStatus, SigningStatus } from '@prisma/client';
import { useRevalidator } from 'react-router';

import { useCurrentTeam } from '~/providers/team';

export type RecipientNotificationState = {
  id: number;
  notificationsOptedOutAt?: Date | null;
  signingStatus: SigningStatus;
};

export type RecipientNotificationsResumeButtonProps = {
  auditLog: TDocumentAuditLog;
  recipients: RecipientNotificationState[];
  documentStatus: DocumentStatus;
};

export const RecipientNotificationsResumeButton = ({
  auditLog,
  recipients,
  documentStatus,
}: RecipientNotificationsResumeButtonProps) => {
  const team = useCurrentTeam();
  const { t } = useLingui();
  const { toast } = useToast();
  const { revalidate } = useRevalidator();
  const utils = trpc.useUtils();
  const { mutateAsync: resumeNotifications, isPending } = trpc.envelope.recipient.resumeNotifications.useMutation();

  if (
    auditLog.type !== DOCUMENT_AUDIT_LOG_TYPE.RECIPIENT_NOTIFICATIONS_OPTED_OUT ||
    documentStatus !== DocumentStatus.PENDING ||
    !canExecuteTeamAction('MANAGE_TEAM', team.currentTeamRole)
  ) {
    return null;
  }

  const recipient = recipients.find((candidate) => candidate.id === auditLog.data.recipientId);

  if (
    !recipient?.notificationsOptedOutAt ||
    recipient.signingStatus !== SigningStatus.NOT_SIGNED ||
    new Date(recipient.notificationsOptedOutAt).getTime() !== new Date(auditLog.data.optedOutAt).getTime()
  ) {
    return null;
  }

  const onResume = async () => {
    try {
      await resumeNotifications({ envelopeId: auditLog.envelopeId, auditLogId: auditLog.id });
      await Promise.all([
        utils.document.auditLog.find.invalidate(),
        utils.envelope.auditLog.find.invalidate(),
        utils.envelope.get.invalidate(),
        revalidate(),
      ]);
      toast({
        title: t`Reminders resumed`,
        description: t`Reminders are enabled again for this recipient and envelope.`,
      });
    } catch (err) {
      const error = AppError.parseError(err);

      toast({
        title: t`Unable to resume reminders`,
        description: error.userMessage || t`Please refresh the envelope and try again.`,
        variant: 'destructive',
      });
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="mt-1 h-7 text-xs"
      loading={isPending}
      onClick={onResume}
    >
      <Trans>Resume reminders</Trans>
    </Button>
  );
};
