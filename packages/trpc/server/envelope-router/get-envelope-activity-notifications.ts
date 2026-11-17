import { getEnvelopeActivityNotifications } from '@documenso/lib/server-only/document/get-latest-envelope-activity';

import { authenticatedProcedure } from '../trpc';
import {
  ZGetEnvelopeActivityNotificationsRequestSchema,
  ZGetEnvelopeActivityNotificationsResponseSchema,
} from './get-envelope-activity-notifications.types';

export const getEnvelopeActivityNotificationsRoute = authenticatedProcedure
  .input(ZGetEnvelopeActivityNotificationsRequestSchema)
  .output(ZGetEnvelopeActivityNotificationsResponseSchema)
  .query(async ({ ctx, input }) => {
    const { teamId } = input;

    return await getEnvelopeActivityNotifications({ userId: ctx.user.id, userEmail: ctx.user.email, teamId });
  });
