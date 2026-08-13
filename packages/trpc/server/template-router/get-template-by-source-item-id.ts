import { getTemplateBySourceItemId } from '@documenso/lib/server-only/template/get-template-by-source-item-id';

import { authenticatedProcedure } from '../trpc';
import {
  ZGetTemplateBySourceItemIdRequestSchema,
  ZGetTemplateBySourceItemIdResponseSchema,
} from './get-template-by-source-item-id.types';

export const getTemplateBySourceItemIdRoute = authenticatedProcedure
  .input(ZGetTemplateBySourceItemIdRequestSchema)
  .output(ZGetTemplateBySourceItemIdResponseSchema)
  .query(async ({ input, ctx }) => {
    return await getTemplateBySourceItemId({
      ...input,
      userId: ctx.user.id,
      teamId: ctx.teamId,
    });
  });
