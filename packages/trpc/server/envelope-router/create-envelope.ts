import { getServerLimits } from '@documenso/ee/server-only/limits/server';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { createEnvelope } from '@documenso/lib/server-only/envelope/create-envelope';
import type { ApiRequestMetadata } from '@documenso/lib/universal/extract-request-metadata';
import type { Logger } from 'pino';

import { authenticatedProcedure } from '../trpc';
import type { TCreateEnvelopeRequest } from './create-envelope.types';
import {
  createEnvelopeMeta,
  ZCreateEnvelopeRequestSchema,
  ZCreateEnvelopeResponseSchema,
} from './create-envelope.types';
import { prepareEnvelopeData } from './prepare-envelope-data';

export const createEnvelopeRoute = authenticatedProcedure
  .meta(createEnvelopeMeta)
  .input(ZCreateEnvelopeRequestSchema)
  .output(ZCreateEnvelopeResponseSchema)
  .mutation(async ({ input, ctx }) => {
    ctx.logger.info({
      input: {
        folderId: input.payload.folderId,
      },
    });

    return await createEnvelopeRouteCaller({
      userId: ctx.user.id,
      teamId: ctx.teamId,
      input,
      apiRequestMetadata: ctx.metadata,
      logger: ctx.logger,
    });
  });

type CreateEnvelopeRouteOptions = {
  /**
   * Verified user ID.
   */
  userId: number;

  /**
   * Unverified team ID.
   */
  teamId: number;
  input: TCreateEnvelopeRequest;
  apiRequestMetadata: ApiRequestMetadata;

  /**
   * Optional pino logger threaded from the calling tRPC context. Passed to
   * downstream helpers (e.g. `convertToPdf`) for structured logging.
   */
  logger?: Logger;

  options?: {
    bypassDefaultRecipients?: boolean;
  };
};

export const createEnvelopeRouteCaller = async ({
  userId,
  teamId,
  input,
  apiRequestMetadata,
  logger,
  options = {},
}: CreateEnvelopeRouteOptions) => {
  const { payload, files } = input;

  const {
    title,
    type,
    externalId,
    visibility,
    globalAccessAuth,
    globalActionAuth,
    formValues,
    folderId,
    meta,
    attachments,
    delegatedDocumentOwner,
  } = payload;

  const { remaining, maximumEnvelopeItemCount } = await getServerLimits({
    userId,
    teamId,
  });

  if (remaining.documents <= 0) {
    throw new AppError(AppErrorCode.LIMIT_EXCEEDED, {
      message: 'You have reached your document limit for this month. Please upgrade your plan.',
      statusCode: 400,
    });
  }

  if (files.length > maximumEnvelopeItemCount) {
    throw new AppError('ENVELOPE_ITEM_LIMIT_EXCEEDED', {
      message: `You cannot upload more than ${maximumEnvelopeItemCount} envelope items per envelope`,
      statusCode: 400,
    });
  }

  const { envelopeItems, recipients: recipientsToCreate } = await prepareEnvelopeData({
    payload,
    files,
    logger,
  });

  const envelope = await createEnvelope({
    userId,
    teamId,
    internalVersion: 2,
    data: {
      type,
      title,
      externalId,
      formValues,
      visibility,
      globalAccessAuth,
      globalActionAuth,
      recipients: recipientsToCreate,
      folderId,
      envelopeItems,
      delegatedDocumentOwner,
    },
    attachments,
    meta,
    requestMetadata: apiRequestMetadata,
    bypassDefaultRecipients: options.bypassDefaultRecipients,
  });

  return {
    id: envelope.id,
  };
};
