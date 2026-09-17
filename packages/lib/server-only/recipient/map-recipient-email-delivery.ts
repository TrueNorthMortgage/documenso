import type { Recipient, RecipientEmailDelivery } from '@prisma/client';

export type RecipientWithEmailDeliveries = Recipient & {
  emailDeliveries: RecipientEmailDelivery[];
};

export const mapRecipientEmailDelivery = <T extends RecipientWithEmailDeliveries>(recipient: T) => {
  const { emailDeliveries, ...recipientData } = recipient;
  const latestEmailDelivery = emailDeliveries[0];

  return {
    ...recipientData,
    latestEmailDelivery:
      latestEmailDelivery?.email.toLowerCase() === recipient.email.toLowerCase() ? latestEmailDelivery : null,
  };
};
