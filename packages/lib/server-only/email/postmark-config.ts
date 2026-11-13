import { createHash } from 'node:crypto';

import { env } from '../../utils/env';

/** Reuse the configured SMTP credential for inbound Postmark Basic Auth. */
export const getPostmarkWebhookSecret = () => {
  const transport = env('NEXT_PRIVATE_SMTP_TRANSPORT') ?? 'smtp-auth';

  if (
    !['smtp-auth', 'smtp-api'].includes(transport) ||
    env('NEXT_PRIVATE_SMTP_SERVICE') ||
    env('NEXT_PRIVATE_SMTP_HOST')?.toLowerCase() !== 'smtp.postmarkapp.com'
  ) {
    return undefined;
  }

  return transport === 'smtp-api' ? env('NEXT_PRIVATE_SMTP_APIKEY') : env('NEXT_PRIVATE_SMTP_PASSWORD');
};

export const getPostmarkDeliveryScope = () => {
  const credential = getPostmarkWebhookSecret();

  if (!credential) {
    return undefined;
  }

  // Scope metadata without persisting or transmitting the credential.
  return createHash('sha256')
    .update(env('NEXT_PRIVATE_SMTP_HOST') ?? '')
    .update(credential)
    .digest('hex');
};

export const getPostmarkDeliveryHeaders = (attempt: { id: string; messageStream: string; providerScope: string }) => ({
  'X-PM-Message-Stream': attempt.messageStream,
  'X-PM-Metadata-deliveryAttemptId': attempt.id,
  'X-PM-Metadata-deliveryScope': attempt.providerScope,
});
