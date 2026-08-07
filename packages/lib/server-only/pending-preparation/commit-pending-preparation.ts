import { prisma } from '@documenso/prisma';
import type { Envelope } from '@prisma/client';
import { ZCreateEnvelopePayloadSchema } from '../../../trpc/server/envelope-router/create-envelope.types';
import { ZCreateDocumentFromTemplateRequestSchema } from '../../../trpc/server/template-router/schema';
import { AppError, AppErrorCode } from '../../errors/app-error';
import type { ApiRequestMetadata } from '../../universal/extract-request-metadata';
import { buildTeamWhereQuery } from '../../utils/teams';
import { sendDocument } from '../document/send-document';
import { createEnvelope } from '../envelope/create-envelope';
import { mapEnvelopeRecipients } from '../envelope/map-envelope-recipients';
import { createDocumentFromTemplate } from '../template/create-document-from-template';

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const pendingPreparationStatus = {
  PENDING: 'PENDING',
  COMMITTED: 'COMMITTED',
  EXPIRED: 'EXPIRED',
} as const;

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
  const externalId =
    typeof pending.payload === 'object' && pending.payload !== null && 'externalId' in pending.payload
      ? String(pending.payload.externalId || pending.id)
      : pending.id;

  if (pending.status === pendingPreparationStatus.COMMITTED) {
    const existingEnvelope = pending.committedEnvelopeId
      ? await prisma.envelope.findUnique({ where: { id: pending.committedEnvelopeId } })
      : await prisma.envelope.findFirst({ where: { externalId } });

    if (existingEnvelope) {
      if (!pending.committedEnvelopeId) {
        await prisma.pendingPreparation.update({
          where: { id: pending.id },
          data: { committedEnvelopeId: existingEnvelope.id },
        });
      }

      return existingEnvelope;
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

  const rawPayload =
    typeof pending.payload === 'object' && pending.payload !== null ? (pending.payload as Record<string, unknown>) : {};

  if (rawPayload.kind === 'template') {
    const payload = ZCreateDocumentFromTemplateRequestSchema.parse(rawPayload);
    const envelope = await createDocumentFromTemplate({
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

    if (payload.distributeDocument) {
      await sendDocument({
        id: { type: 'envelopeId', id: envelope.id },
        userId,
        teamId: pending.teamId,
        requestMetadata,
      });
    }

    await prisma.pendingPreparation.update({
      where: { id: pending.id },
      data: { committedEnvelopeId: envelope.id },
    });

    return envelope;
  }

  const payload = ZCreateEnvelopePayloadSchema.parse(pending.payload);
  const envelopeItems = pending.documents.map((document) => ({
    title: String(
      document.fileMetadata && typeof document.fileMetadata === 'object' && 'name' in document.fileMetadata
        ? document.fileMetadata.name
        : payload.title,
    ),
    documentDataId: document.documentDataId,
    order: document.order,
  }));

  const envelope = await createEnvelope({
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
    data: { committedEnvelopeId: envelope.id },
  });

  return envelope;
};
