import { hasEmailDeliveryWarning } from '@documenso/lib/universal/email-delivery';
import { Trans } from '@lingui/react/macro';
import { EmailDeliveryStatus, RecipientRole, SigningStatus } from '@prisma/client';
import { AlertTriangleIcon } from 'lucide-react';

type RecipientEmailDeliveryStatusProps = {
  recipient: {
    email: string;
    emailDeliveryEmail?: string | null;
    emailDeliveryStatus?: EmailDeliveryStatus | null;
    signingStatus: SigningStatus;
    role: RecipientRole;
  };
};

export const RecipientEmailDeliveryStatus = ({ recipient }: RecipientEmailDeliveryStatusProps) => {
  if (
    recipient.role === RecipientRole.CC ||
    recipient.signingStatus !== SigningStatus.NOT_SIGNED ||
    recipient.email.toLowerCase() !== recipient.emailDeliveryEmail?.toLowerCase()
  ) {
    return null;
  }

  const isWarning = hasEmailDeliveryWarning(recipient);

  return (
    <span
      className={
        isWarning
          ? 'mt-1 flex items-start gap-1 whitespace-normal text-amber-700 dark:text-amber-400'
          : 'mt-1 block whitespace-normal'
      }
    >
      {isWarning && <AlertTriangleIcon className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />}
      {recipient.emailDeliveryStatus === EmailDeliveryStatus.BOUNCED && (
        <Trans>Email bounced. Check the address and resend.</Trans>
      )}
      {recipient.emailDeliveryStatus === EmailDeliveryStatus.BLOCKED && (
        <Trans>Email delivery is blocked. Check the address or contact support.</Trans>
      )}
      {recipient.emailDeliveryStatus === EmailDeliveryStatus.SPAM_COMPLAINT && (
        <Trans>Email reported as spam. Contact support before resending.</Trans>
      )}
      {recipient.emailDeliveryStatus === EmailDeliveryStatus.SEND_FAILED && (
        <Trans>Email could not be sent. Try resending or contact support.</Trans>
      )}
      {recipient.emailDeliveryStatus === EmailDeliveryStatus.DELAYED && <Trans>Email delivery is delayed.</Trans>}
      {recipient.emailDeliveryStatus === EmailDeliveryStatus.DELIVERED && <Trans>Email delivered.</Trans>}
      {recipient.emailDeliveryStatus === EmailDeliveryStatus.ACCEPTED && <Trans>Email awaiting delivery.</Trans>}
      {recipient.emailDeliveryStatus === EmailDeliveryStatus.PENDING && <Trans>Email pending.</Trans>}
    </span>
  );
};
