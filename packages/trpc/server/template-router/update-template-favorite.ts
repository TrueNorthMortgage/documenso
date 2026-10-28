import { updateTemplateFavorite } from '@documenso/lib/server-only/template/update-template-favorite';

import { authenticatedProcedure } from '../trpc';
import {
  ZUpdateTemplateFavoriteRequestSchema,
  ZUpdateTemplateFavoriteResponseSchema,
} from './update-template-favorite.types';

export const updateTemplateFavoriteRoute = authenticatedProcedure
  .input(ZUpdateTemplateFavoriteRequestSchema)
  .output(ZUpdateTemplateFavoriteResponseSchema)
  .mutation(({ input, ctx }) => {
    const { envelopeId, data } = input;

    return updateTemplateFavorite({
      userId: ctx.user.id,
      teamId: ctx.teamId,
      envelopeId,
      isFavorite: data.isFavorite,
    });
  });
