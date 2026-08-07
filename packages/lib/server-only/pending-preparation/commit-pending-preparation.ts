import { getServerLimits } from '@documenso/ee/server-only/limits/server';
import { prisma } from '@documenso/prisma';
import type { Envelope } from '@prisma/client';
import { DocumentStatus } from '@prisma/client';
import { ZCreateEnvelopePayloadSchema } from '../../../trpc/server/envelope-router/create-envelope.types';
import { ZCreateDocumentFromTemplateRequestSchema } from '../../../trpc/server/template-router/schema';
import { AppError, AppErrorCode } from '../../errors/app-error';
import type { ApiRequestMetadata } from '../../universal/extract-request-metadata';
import { buildTeamWhereQuery } from '../../utils/teams';
import { sendDocument } from '../document/send-document';
import { createEnvelope } from '../envelope/create-envelope';
import { mapEnvelopeRecipients } from '../envelope/map-envelope-recipients';
import { createDocumentFromTemplate } from '../template/create-document-from-template';
import { getPendingPreparationDocumentMetadata } from './document-metadata';

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const pendingPreparationStatus = {
  PENDING: 'PENDING',
  COMMITTED: 'COMMITTED',
  EXPIRED: 'EXPIRED',
} as const;

const PENDING_COMMIT_CLAIM_TIMEOUT_MS = 30 * 60 * 1000;

const shouldDistributeTemplate = (payload: Record<string, unknown>) =>
  payload.kind === 'template' && payload.distributeDocument === true;

export const commitPendingPreparation = async ({
  id,
  userId,
  userEmail,
  requestMetadata,
}: {
  id: string;
  userId: number;
  userEmail: string;
  requestMetadata: ApiRequestMetadata;
}): Promise<Envelope> => {
  const pending = await prisma.pendingPreparation.findUnique({
    where: { id },
    include: {
      documents: {
        orderBy: { order: 'asc' },
      },
    },
  });

  if (!pending) {
    throw new AppError(AppErrorCode.NOT_FOUND, { message: 'Pending preparation not found' });
  }

  const now = new Date();
  const rawPayload =
    typeof pending.payload === 'object' && pending.payload !== null ? (pending.payload as Record<string, unknown>) : {};
  const externalId = String(rawPayload.externalId || pending.id);

  if (normalizeEmail(pending.actorEmail) !== normalizeEmail(userEmail)) {
    throw new AppError(AppErrorCode.UNAUTHORIZED, { message: 'Pending preparation does not belong to this user' });
  }

  const team = await prisma.team.findFirst({
    where: buildTeamWhereQuery({ teamId: pending.teamId, userId }),
    select: { id: true },
  });

  if (!team) {
    throw new AppError(AppErrorCode.UNAUTHORIZED, { message: 'User is not a member of the pending team' });
  }

  if (pending.status === pendingPreparationStatus.COMMITTED) {
    const existingEnvelope = pending.committedEnvelopeId
      ? await prisma.envelope.findUnique({ where: { id: pending.committedEnvelopeId } })
      : await prisma.envelope.findFirst({
          where: {
            externalId,
            teamId: pending.teamId,
            userId,
            createdAt: { gte: pending.createdAt },
          },
        });

    if (existingEnvelope) {
      if (!pending.committedEnvelopeId) {
        await prisma.pendingPreparation.update({
          where: { id: pending.id },
          data: { committedEnvelopeId: existingEnvelope.id },
        });
      }

      if (shouldDistributeTemplate(rawPayload) && existingEnvelope.status === DocumentStatus.DRAFT) {
        return sendDocument({
          id: { type: 'envelopeId', id: existingEnvelope.id },
          userId,
          teamId: pending.teamId,
          requestMetadata,
        });
      }

      return existingEnvelope;
    }

    if (pending.expiresAt <= now) {
      await prisma.pendingPreparation.updateMany({
        where: {
          id: pending.id,
          status: pendingPreparationStatus.COMMITTED,
          committedEnvelopeId: null,
        },
        data: { status: pendingPreparationStatus.EXPIRED },
      });

      throw new AppError(AppErrorCode.NOT_FOUND, { message: 'Pending preparation has expired' });
    }

    const staleClaimCutoff = new Date(now.getTime() - PENDING_COMMIT_CLAIM_TIMEOUT_MS);
    const recovered = await prisma.pendingPreparation.updateMany({
      where: {
        id: pending.id,
        status: pendingPreparationStatus.COMMITTED,
        committedEnvelopeId: null,
        updatedAt: { lt: staleClaimCutoff },
      },
      data: { status: pendingPreparationStatus.PENDING },
    });

    if (recovered.count === 1) {
      return commitPendingPreparation({ id, userId, userEmail, requestMetadata });
    }

    throw new AppError('PENDING_PREPARATION_BUSY', {
      message: 'Pending preparation is already being committed',
      statusCode: 409,
    });
  }

  if (pending.expiresAt <= now || pending.status === pendingPreparationStatus.EXPIRED) {
    await prisma.pendingPreparation.updateMany({
      where: { id: pending.id, status: pendingPreparationStatus.PENDING },
      data: { status: pendingPreparationStatus.EXPIRED },
    });

    throw new AppError(AppErrorCode.NOT_FOUND, { message: 'Pending preparation has expired' });
  }

  const claimed = await prisma.pendingPreparation.updateMany({
    where: {
      id: pending.id,
      status: pendingPreparationStatus.PENDING,
      expiresAt: { gt: now },
    },
    data: { status: pendingPreparationStatus.COMMITTED },
  });

  if (claimed.count !== 1) {
    return commitPendingPreparation({ id, userId, userEmail, requestMetadata });
  }

  let createdEnvelope: Envelope | undefined;

  try {
    const { remaining } = await getServerLimits({
      userId,
      teamId: pending.teamId,
    });

    if (remaining.documents <= 0) {
      throw new AppError(AppErrorCode.LIMIT_EXCEEDED, {
        message: 'You have reached your document limit for this month. Please upgrade your plan.',
        statusCode: 400,
      });
    }

    if (rawPayload.kind === 'template') {
      const payload = ZCreateDocumentFromTemplateRequestSchema.parse(rawPayload);
      createdEnvelope = await createDocumentFromTemplate({
        id: {
          type: 'templateId',
          id: payload.templateId,
        },
        externalId,
        userId,
        teamId: pending.teamId,
        recipients: payload.recipients,
        customDocumentData: payload.customDocumentData,
        folderId: payload.folderId,
        prefillFields: payload.prefillFields,
        override: payload.override,
        attachments: payload.attachments,
        formValues: payload.formValues,
        requestMetadata,
      });

      await prisma.pendingPreparation.update({
        where: { id: pending.id },
        data: { committedEnvelopeId: createdEnvelope.id },
      });

      if (payload.distributeDocument) {
        createdEnvelope = await sendDocument({
          id: { type: 'envelopeId', id: createdEnvelope.id },
          userId,
          teamId: pending.teamId,
          requestMetadata,
        });
      }

      return createdEnvelope;
    }

    const payload = ZCreateEnvelopePayloadSchema.parse(pending.payload);
    const envelopeItems = pending.documents.map((document) => {
      const metadata = getPendingPreparationDocumentMetadata(document.fileMetadata);

      return {
        title: metadata.name || payload.title,
        documentDataId: document.documentDataId,
        order: document.order,
        placeholders: metadata.placeholders,
      };
    });

    createdEnvelope = await createEnvelope({
      userId,
      teamId: pending.teamId,
      internalVersion: 2,
      data: {
        type: 'DOCUMENT',
        title: payload.title,
        externalId,
        formValues: payload.formValues,
        visibility: payload.visibility,
        globalAccessAuth: payload.globalAccessAuth,
        globalActionAuth: payload.globalActionAuth,
        recipients: mapEnvelopeRecipients(payload.recipients, envelopeItems),
        folderId: payload.folderId,
        envelopeItems,
      },
      attachments: payload.attachments,
      meta: payload.meta,
      requestMetadata,
    });

    await prisma.pendingPreparation.update({
      where: { id: pending.id },
      data: { committedEnvelopeId: createdEnvelope.id },
    });

    return createdEnvelope;
  } catch (error) {
    if (createdEnvelope) {
      await prisma.pendingPreparation.updateMany({
        where: {
          id: pending.id,
          status: pendingPreparationStatus.COMMITTED,
          committedEnvelopeId: null,
        },
        data: { committedEnvelopeId: createdEnvelope.id },
      });
    } else {
      await prisma.pendingPreparation.updateMany({
        where: {
          id: pending.id,
          status: pendingPreparationStatus.COMMITTED,
          committedEnvelopeId: null,
        },
        data: { status: pendingPreparationStatus.PENDING },
      });
    }

    throw error;
  }
};
