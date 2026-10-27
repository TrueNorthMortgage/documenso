import { DocumentDistributionMethod, type DocumentMeta, type Recipient, SendStatus } from '@prisma/client';

import { resolveNextReminderAt, ZEnvelopeReminderSettings } from '../../constants/envelope-reminder';

export const resolveResumedRecipientReminder = ({
  recipient,
  documentMeta,
}: {
  recipient: Pick<Recipient, 'sendStatus' | 'sentAt' | 'expiresAt' | 'lastReminderSentAt'>;
  documentMeta: Pick<DocumentMeta, 'distributionMethod' | 'reminderSettings'> | null;
}) => {
  if (
    recipient.sendStatus !== SendStatus.SENT ||
    !recipient.sentAt ||
    (recipient.expiresAt && recipient.expiresAt <= new Date()) ||
    documentMeta?.distributionMethod === DocumentDistributionMethod.NONE
  ) {
    return null;
  }

  return resolveNextReminderAt({
    config: documentMeta?.reminderSettings ? ZEnvelopeReminderSettings.parse(documentMeta.reminderSettings) : null,
    sentAt: recipient.sentAt,
    lastReminderSentAt: recipient.lastReminderSentAt,
  });
};
