import { EmailDeliveryStatus, RecipientRole, SigningStatus } from '@prisma/client';

const failureStatuses: EmailDeliveryStatus[] = [
  EmailDeliveryStatus.BOUNCED,
  EmailDeliveryStatus.BLOCKED,
  EmailDeliveryStatus.SPAM_COMPLAINT,
  EmailDeliveryStatus.SEND_FAILED,
];

export const isEmailDeliveryFailure = (status: EmailDeliveryStatus | null | undefined) =>
  status != null && failureStatuses.includes(status);

export const hasEmailDeliveryWarning = (recipient: {
  email: string;
  emailDeliveryEmail?: string | null;
  emailDeliveryStatus?: EmailDeliveryStatus | null;
  signingStatus: SigningStatus;
  role: RecipientRole;
  documentDeletedAt?: Date | null;
}) =>
  recipient.role !== RecipientRole.CC &&
  recipient.signingStatus === SigningStatus.NOT_SIGNED &&
  !recipient.documentDeletedAt &&
  recipient.email.toLowerCase() === recipient.emailDeliveryEmail?.toLowerCase() &&
  isEmailDeliveryFailure(recipient.emailDeliveryStatus);

/** Reduce event state independently of arrival order. Permanent failures remain terminal for an attempt. */
export const reduceEmailDeliveryStatus = (
  current: { status: EmailDeliveryStatus; statusAt: Date },
  incoming: { status: EmailDeliveryStatus; occurredAt: Date },
) => {
  if (current.status === EmailDeliveryStatus.SPAM_COMPLAINT) {
    return current.status;
  }

  if (incoming.status === EmailDeliveryStatus.SPAM_COMPLAINT) {
    return incoming.status;
  }

  const permanentStatuses: EmailDeliveryStatus[] = [EmailDeliveryStatus.BOUNCED, EmailDeliveryStatus.BLOCKED];
  const isCurrentPermanent = permanentStatuses.includes(current.status);
  const isIncomingPermanent = permanentStatuses.includes(incoming.status);

  if (isCurrentPermanent && !isIncomingPermanent) {
    return current.status;
  }

  if (isIncomingPermanent && !isCurrentPermanent) {
    return incoming.status;
  }

  // Acceptance/local errors cannot override evidence from the provider.
  const localStatuses: EmailDeliveryStatus[] = [
    EmailDeliveryStatus.PENDING,
    EmailDeliveryStatus.ACCEPTED,
    EmailDeliveryStatus.SEND_FAILED,
  ];

  if (!localStatuses.includes(current.status) && localStatuses.includes(incoming.status)) {
    return current.status;
  }

  if (localStatuses.includes(current.status) && !localStatuses.includes(incoming.status)) {
    return incoming.status;
  }

  // Confirmed delivery wins over a temporary failure in either arrival order.
  if (current.status === EmailDeliveryStatus.DELIVERED && incoming.status === EmailDeliveryStatus.DELAYED) {
    return current.status;
  }

  if (current.status === EmailDeliveryStatus.DELAYED && incoming.status === EmailDeliveryStatus.DELIVERED) {
    return incoming.status;
  }

  if (incoming.occurredAt < current.statusAt) {
    return current.status;
  }

  return incoming.status;
};
