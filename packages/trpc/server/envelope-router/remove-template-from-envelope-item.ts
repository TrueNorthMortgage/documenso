import { removeTemplateFromEnvelopeItem } from '@documenso/lib/server-only/template/apply-template-to-envelope-item';

import { authenticatedProcedure } from '../trpc';
import {
  ZRemoveTemplateFromEnvelopeItemRequestSchema,
  ZRemoveTemplateFromEnvelopeItemResponseSchema,
} from './remove-template-from-envelope-item.types';

export const removeTemplateFromEnvelopeItemRoute = authenticatedProcedure
  .input(ZRemoveTemplateFromEnvelopeItemRequestSchema)
  .output(ZRemoveTemplateFromEnvelopeItemResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { teamId, user } = ctx;

    const result = await removeTemplateFromEnvelopeItem({
      ...input,
      userId: user.id,
      teamId,
      requestMetadata: ctx.metadata,
    });

    return { data: result.fields };
  });
