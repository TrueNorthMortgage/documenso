import { getSharedEnvelopePreview } from '@documenso/lib/server-only/envelope/envelope-preview';

import { authenticatedProcedure } from '../trpc';
import {
  ZGetSharedEnvelopePreviewRequestSchema,
  ZGetSharedEnvelopePreviewResponseSchema,
} from './get-shared-envelope-preview.types';

export const getSharedEnvelopePreviewRoute = authenticatedProcedure
  .input(ZGetSharedEnvelopePreviewRequestSchema)
  .output(ZGetSharedEnvelopePreviewResponseSchema)
  .query(async ({ input, ctx }) => {
    const { envelopeId } = input;
    ctx.res.headers.set('Cache-Control', 'private, no-store');

    return await getSharedEnvelopePreview({ envelopeId, teamId: ctx.teamId, userId: ctx.user.id });
  });
