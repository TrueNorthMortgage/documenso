import { z } from 'zod';

import type { JobDefinition } from '../../client/_internal/job';

const SEND_RECIPIENT_OPENED_EMAIL_JOB_DEFINITION_ID = 'send.recipient.opened.email';

const SEND_RECIPIENT_OPENED_EMAIL_JOB_DEFINITION_SCHEMA = z.object({
  envelopeId: z.string(),
  recipientId: z.number(),
});

export type TSendRecipientOpenedEmailJobDefinition = z.infer<typeof SEND_RECIPIENT_OPENED_EMAIL_JOB_DEFINITION_SCHEMA>;

export const SEND_RECIPIENT_OPENED_EMAIL_JOB_DEFINITION = {
  id: SEND_RECIPIENT_OPENED_EMAIL_JOB_DEFINITION_ID,
  name: 'Send Recipient Opened Email',
  version: '1.0.0',
  trigger: {
    name: SEND_RECIPIENT_OPENED_EMAIL_JOB_DEFINITION_ID,
    schema: SEND_RECIPIENT_OPENED_EMAIL_JOB_DEFINITION_SCHEMA,
  },
  handler: async ({ payload, io }) => {
    const handler = await import('./send-recipient-opened-email.handler');

    await handler.run({ payload, io });
  },
} as const satisfies JobDefinition<
  typeof SEND_RECIPIENT_OPENED_EMAIL_JOB_DEFINITION_ID,
  z.infer<typeof SEND_RECIPIENT_OPENED_EMAIL_JOB_DEFINITION_SCHEMA>
>;
