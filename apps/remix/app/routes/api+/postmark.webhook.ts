import { handlePostmarkWebhook } from '@documenso/lib/server-only/email/handle-postmark-webhook';

import type { Route } from './+types/postmark.webhook';

export async function action({ request }: Route.ActionArgs) {
  return await handlePostmarkWebhook(request);
}
