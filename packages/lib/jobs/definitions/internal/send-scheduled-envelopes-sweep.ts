import { z } from 'zod';

import type { JobDefinition } from '../../client/_internal/job';

const SEND_SCHEDULED_ENVELOPES_SWEEP_JOB_DEFINITION_ID = 'internal.send-scheduled-envelopes-sweep';
const SEND_SCHEDULED_ENVELOPES_SWEEP_JOB_DEFINITION_SCHEMA = z.object({});

export type TSendScheduledEnvelopesSweepJobDefinition = z.infer<
  typeof SEND_SCHEDULED_ENVELOPES_SWEEP_JOB_DEFINITION_SCHEMA
>;

export const SEND_SCHEDULED_ENVELOPES_SWEEP_JOB_DEFINITION = {
  id: SEND_SCHEDULED_ENVELOPES_SWEEP_JOB_DEFINITION_ID,
  name: 'Send Scheduled Envelopes Sweep',
  version: '1.0.0',
  trigger: {
    name: SEND_SCHEDULED_ENVELOPES_SWEEP_JOB_DEFINITION_ID,
    schema: SEND_SCHEDULED_ENVELOPES_SWEEP_JOB_DEFINITION_SCHEMA,
    cron: '* * * * *',
  },
  handler: async ({ payload, io }) => {
    const handler = await import('./send-scheduled-envelopes-sweep.handler');
    await handler.run({ payload, io });
  },
} as const satisfies JobDefinition<
  typeof SEND_SCHEDULED_ENVELOPES_SWEEP_JOB_DEFINITION_ID,
  TSendScheduledEnvelopesSweepJobDefinition
>;
