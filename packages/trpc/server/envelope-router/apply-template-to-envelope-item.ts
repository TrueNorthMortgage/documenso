import { applyTemplateToEnvelopeItem } from '@documenso/lib/server-only/template/apply-template-to-envelope-item';

import { authenticatedProcedure } from '../trpc';
import {
  ZApplyTemplateToEnvelopeItemRequestSchema,
  ZApplyTemplateToEnvelopeItemResponseSchema,
} from './apply-template-to-envelope-item.types';

export const applyTemplateToEnvelopeItemRoute = authenticatedProcedure
  .input(ZApplyTemplateToEnvelopeItemRequestSchema)
  .output(ZApplyTemplateToEnvelopeItemResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { teamId, user } = ctx;

    const result = await applyTemplateToEnvelopeItem({
      ...input,
      userId: user.id,
      teamId,
      requestMetadata: ctx.metadata,
    });

    return { data: result.fields };
  });
