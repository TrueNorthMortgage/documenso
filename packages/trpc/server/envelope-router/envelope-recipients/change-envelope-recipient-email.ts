import { changeEnvelopeRecipientEmail } from '@documenso/lib/server-only/recipient/change-envelope-recipient-email';

import { authenticatedProcedure } from '../../trpc';
import {
  changeEnvelopeRecipientEmailMeta,
  ZChangeEnvelopeRecipientEmailRequestSchema,
  ZChangeEnvelopeRecipientEmailResponseSchema,
} from './change-envelope-recipient-email.types';

export const changeEnvelopeRecipientEmailRoute = authenticatedProcedure
  .meta(changeEnvelopeRecipientEmailMeta)
  .input(ZChangeEnvelopeRecipientEmailRequestSchema)
  .output(ZChangeEnvelopeRecipientEmailResponseSchema)
  .mutation(async ({ input, ctx }) => {
    await changeEnvelopeRecipientEmail({
      envelopeId: input.envelopeId,
      recipientId: input.recipientId,
      email: input.email,
      userId: ctx.user.id,
      teamId: ctx.teamId,
      requestMetadata: ctx.metadata,
    });

    return { success: true };
  });
