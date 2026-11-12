import { sendEnvelopePreview } from '@documenso/lib/server-only/envelope/envelope-preview';

import { authenticatedProcedure } from '../trpc';
import { ZSendEnvelopePreviewRequestSchema, ZSendEnvelopePreviewResponseSchema } from './send-envelope-preview.types';

export const sendEnvelopePreviewRoute = authenticatedProcedure
  .input(ZSendEnvelopePreviewRequestSchema)
  .output(ZSendEnvelopePreviewResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { envelopeId, emails, subject, message } = input;

    return await sendEnvelopePreview({
      envelopeId,
      emails,
      subject,
      message,
      teamId: ctx.teamId,
      user: ctx.user,
      requestMetadata: ctx.metadata.requestMetadata,
    });
  });
