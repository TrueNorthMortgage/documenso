import { addTemplateToEnvelope } from '@documenso/lib/server-only/template/add-template-to-envelope';

import { authenticatedProcedure } from '../trpc';
import {
  ZAddTemplateToEnvelopeRequestSchema,
  ZAddTemplateToEnvelopeResponseSchema,
} from './add-template-to-envelope.types';

export const addTemplateToEnvelopeRoute = authenticatedProcedure
  .input(ZAddTemplateToEnvelopeRequestSchema)
  .output(ZAddTemplateToEnvelopeResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { user, teamId } = ctx;

    const result = await addTemplateToEnvelope({
      ...input,
      userId: user.id,
      teamId,
      requestMetadata: ctx.metadata,
    });

    return {
      data: result.envelopeItem,
      fields: result.fields,
    };
  });
