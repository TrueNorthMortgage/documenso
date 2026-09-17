import { prisma } from '@documenso/prisma';
import { EmailDeliveryStatus, type EmailDeliveryType } from '@prisma/client';

import { env } from '../../utils/env';
import { getPostmarkEnvelopeHeaders } from './postmark-headers';

export type PrepareRecipientEmailDeliveryOptions = {
  envelopeId: string;
  recipientId: number;
  email: string;
  type: EmailDeliveryType;
};

export type TrackRecipientEmailDeliveryOptions = PrepareRecipientEmailDeliveryOptions & {
  sendEmail: (headers: Record<string, string>) => Promise<unknown>;
};

/**
 * Creates a delivery attempt before handing the message to the email provider.
 * The attempt ID is sent as Postmark metadata so every webhook updates the
 * exact send, including resends and reminders.
 */
export const prepareRecipientEmailDelivery = async ({
  envelopeId,
  recipientId,
  email,
  type,
}: PrepareRecipientEmailDeliveryOptions) => {
  const delivery = await prisma.recipientEmailDelivery.create({
    data: {
      envelopeId,
      recipientId,
      email,
      type,
    },
  });

  return {
    delivery,
    headers: getPostmarkEnvelopeHeaders({ deliveryId: delivery.id, envelopeId, recipientId }),
  };
};

export const trackRecipientEmailDelivery = async ({ sendEmail, ...options }: TrackRecipientEmailDeliveryOptions) => {
  const isPostmarkTrackingEnabled =
    Boolean(env('NEXT_PRIVATE_POSTMARK_WEBHOOK_USERNAME')) && Boolean(env('NEXT_PRIVATE_POSTMARK_WEBHOOK_PASSWORD'));

  if (!isPostmarkTrackingEnabled) {
    return await sendEmail({});
  }

  const { delivery, headers } = await prepareRecipientEmailDelivery(options);

  try {
    return await sendEmail(headers);
  } catch (error) {
    await prisma.recipientEmailDelivery.update({
      where: { id: delivery.id },
      data: {
        status: EmailDeliveryStatus.FAILED,
        failedAt: new Date(),
        failureType: 'SEND_ERROR',
        failureReason: error instanceof Error ? error.message : 'Email provider rejected the message',
      },
    });

    throw error;
  }
};
