import { DOCUMENT_AUDIT_LOG_TYPE } from '@documenso/lib/types/document-audit-logs';
import type { ApiRequestMetadata } from '@documenso/lib/universal/extract-request-metadata';
import { createDocumentAuditLogData } from '@documenso/lib/utils/document-audit-logs';
import { prisma } from '@documenso/prisma';
import { DocumentStatus, EnvelopeType, Prisma, WebhookTriggerEvents } from '@prisma/client';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { jobs } from '../../jobs/client';
import { mapEnvelopeToWebhookDocumentPayload, ZWebhookDocumentSchema } from '../../types/webhook-payload';
import type { EnvelopeIdOptions } from '../../utils/envelope';
import { mapSecondaryIdToDocumentId } from '../../utils/envelope';
import { hasCompletedRecipient } from '../../utils/recipients';
import { triggerWebhook } from '../webhooks/trigger/trigger-webhook';
import { duplicateEnvelope } from './duplicate-envelope';
import { getEnvelopeWhereInput } from './get-envelope-by-id';

export type CreateEnvelopeCorrectionOptions = {
  id: EnvelopeIdOptions;
  userId: number;
  teamId: number;
  requestMetadata: ApiRequestMetadata;
};

export const createEnvelopeCorrection = async ({
  id,
  userId,
  teamId,
  requestMetadata,
}: CreateEnvelopeCorrectionOptions) => {
  const { envelopeWhereInput } = await getEnvelopeWhereInput({
    id,
    userId,
    teamId,
    type: EnvelopeType.DOCUMENT,
  });

  const { cancelledEnvelope, duplicatedEnvelope } = await prisma.$transaction(
    async (tx) => {
      const envelope = await tx.envelope.findFirst({
        where: envelopeWhereInput,
        include: {
          recipients: true,
        },
      });

      if (!envelope) {
        throw new AppError(AppErrorCode.NOT_FOUND, {
          message: 'Envelope not found',
        });
      }

      if (envelope.status !== DocumentStatus.PENDING || envelope.completedAt || envelope.deletedAt) {
        throw new AppError(AppErrorCode.INVALID_REQUEST, {
          message: 'Only active pending envelopes can be corrected',
        });
      }

      if (envelope.internalVersion !== 2 || !hasCompletedRecipient(envelope.recipients)) {
        throw new AppError(AppErrorCode.INVALID_REQUEST, {
          message: 'A corrected copy is only required after a recipient has completed the envelope',
        });
      }

      const duplicatedEnvelope = await duplicateEnvelope({
        id,
        userId,
        teamId,
        transaction: tx,
        triggerDocumentCreatedWebhook: false,
      });

      const updatedEnvelope = await tx.envelope.update({
        where: {
          id: envelope.id,
        },
        data: {
          status: DocumentStatus.REJECTED,
          correctionStartedAt: null,
        },
        include: {
          documentMeta: true,
          recipients: true,
        },
      });

      await tx.documentAuditLog.create({
        data: createDocumentAuditLogData({
          type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_CORRECTION_STARTED,
          envelopeId: envelope.id,
          metadata: requestMetadata,
          data: {},
        }),
      });

      return {
        cancelledEnvelope: updatedEnvelope,
        duplicatedEnvelope,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );

  const correctedEnvelopeForWebhook = await prisma.envelope.findFirstOrThrow({
    where: {
      id: duplicatedEnvelope.id,
    },
    include: {
      documentMeta: true,
      recipients: true,
    },
  });

  await Promise.all([
    jobs.triggerJob({
      name: 'send.document.cancelled.emails',
      payload: {
        documentId: mapSecondaryIdToDocumentId(cancelledEnvelope.secondaryId),
        cancellationReason: 'The document owner created a corrected signing package.',
        requestMetadata: requestMetadata.requestMetadata,
      },
    }),
    triggerWebhook({
      event: WebhookTriggerEvents.DOCUMENT_CANCELLED,
      data: ZWebhookDocumentSchema.parse(mapEnvelopeToWebhookDocumentPayload(cancelledEnvelope)),
      userId,
      teamId,
    }),
    triggerWebhook({
      event: WebhookTriggerEvents.DOCUMENT_CREATED,
      data: ZWebhookDocumentSchema.parse(mapEnvelopeToWebhookDocumentPayload(correctedEnvelopeForWebhook)),
      userId,
      teamId,
    }),
  ]);

  return duplicatedEnvelope;
};
