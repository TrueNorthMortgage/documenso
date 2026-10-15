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
