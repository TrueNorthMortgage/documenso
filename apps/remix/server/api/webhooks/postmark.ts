import { timingSafeEqual } from 'node:crypto';

import { processPostmarkEvent } from '@documenso/lib/server-only/email/email-delivery';
import { getPostmarkWebhookSecret } from '@documenso/lib/server-only/email/postmark-config';
import { normalizePostmarkEvent, ZPostmarkEventSchema } from '@documenso/lib/server-only/email/postmark-event';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import type { HonoEnv } from '../../router';

export const postmarkWebhookRoute = new Hono<HonoEnv>();

postmarkWebhookRoute.use('*', bodyLimit({ maxSize: 256 * 1024 }));
postmarkWebhookRoute.post('/', async (c) => {
  const secret = getPostmarkWebhookSecret();

  if (!secret) {
    return c.json({ error: 'Webhook is not configured' }, 503);
  }

  const expected = Buffer.from(`Basic ${Buffer.from(`documenso:${secret}`).toString('base64')}`);
  const provided = Buffer.from(c.req.header('authorization') ?? '');

  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const payload: unknown = await c.req.json().catch(() => null);
  const parsed = ZPostmarkEventSchema.safeParse(payload);

  if (!parsed.success) {
    return c.json({ error: 'Invalid event' }, 400);
  }

  try {
    const outcome = await processPostmarkEvent(normalizePostmarkEvent(parsed.data));

    if (outcome === 'UNMATCHED') {
      c.var.logger.warn('Postmark delivery event did not match a tracked attempt');
    }

    return c.json({ status: outcome }, 200);
  } catch {
    // Do not log payloads or credentials. Return retryable failure until persistence succeeds.
    c.var.logger.error('Postmark delivery event persistence failed');
    return c.json({ error: 'Could not persist event' }, 503);
  }
});
