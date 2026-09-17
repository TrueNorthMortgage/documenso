import { DOCUMENT_AUDIT_LOG_TYPE } from '@documenso/lib/types/document-audit-logs';
import type { ApiRequestMetadata } from '@documenso/lib/universal/extract-request-metadata';
import { createDocumentAuditLogData } from '@documenso/lib/utils/document-audit-logs';
import { prisma } from '@documenso/prisma';
import { DocumentStatus, EnvelopeType } from '@prisma/client';

import { AppError, AppErrorCode } from '../../errors/app-error';
import type { EnvelopeIdOptions } from '../../utils/envelope';
import { hasCompletedRecipient } from '../../utils/recipients';
import { getEnvelopeWhereInput } from './get-envelope-by-id';

export type StartEnvelopeCorrectionOptions = {
  id: EnvelopeIdOptions;
  userId: number;
  teamId: number;
  requestMetadata: ApiRequestMetadata;
};

export const startEnvelopeCorrection = async ({
  id,
  userId,
  teamId,
  requestMetadata,
}: StartEnvelopeCorrectionOptions) => {
  const { envelopeWhereInput } = await getEnvelopeWhereInput({
    id,
    userId,
    teamId,
    type: EnvelopeType.DOCUMENT,
  });

  const envelope = await prisma.envelope.findFirst({
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

  if (envelope.internalVersion !== 2) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Envelope correction is only supported for version 2 envelopes',
    });
  }

  if (hasCompletedRecipient(envelope.recipients)) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'A recipient completed this document before correction started',
      userMessage: 'A recipient has completed this document. Refresh the page to create a corrected copy instead.',
    });
  }

  if (envelope.correctionStartedAt) {
    return envelope;
  }

  return await prisma.$transaction(async (tx) => {
    const correctedEnvelope = await tx.envelope.update({
      where: {
        id: envelope.id,
      },
      data: {
        correctionStartedAt: new Date(),
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

    return correctedEnvelope;
  });
};
