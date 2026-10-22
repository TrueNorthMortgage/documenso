import { replaceFilledSignatures } from '@documenso/lib/server-only/field/replace-filled-signatures';

import { procedure } from '../trpc';
import {
  ZReplaceFilledSignaturesRequestSchema,
  ZReplaceFilledSignaturesResponseSchema,
} from './replace-filled-signatures.types';

export const replaceFilledSignaturesRoute = procedure
  .input(ZReplaceFilledSignaturesRequestSchema)
  .output(ZReplaceFilledSignaturesResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const fields = await replaceFilledSignatures({
      ...input,
      userId: ctx.user?.id,
      requestMetadata: ctx.metadata,
    });

    return { fields };
  });
