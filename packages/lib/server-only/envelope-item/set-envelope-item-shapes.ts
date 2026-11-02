import { prisma } from '@documenso/prisma';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { DOCUMENT_AUDIT_LOG_TYPE } from '../../types/document-audit-logs';
import { canEditEnvelopeShapes, parseEnvelopeShapes, ZEnvelopeShapesSchema } from '../../types/envelope-shape';
import type { ApiRequestMetadata } from '../../universal/extract-request-metadata';
import { createDocumentAuditLogData } from '../../utils/document-audit-logs';
import { getEnvelopeWhereInput } from '../envelope/get-envelope-by-id';
import { getEnvelopeItemPageCounts } from '../pdf/get-envelope-item-page-counts';
import { assertCanManageTemplate } from '../template/validate-template-access';

type SetEnvelopeItemShapesOptions = {
  userId: number;
  teamId: number;
  envelopeId: string;
  envelopeItemId: string;
  shapes: unknown;
  previousShapes: unknown;
  requestMetadata: ApiRequestMetadata;
};

export const setEnvelopeItemShapes = async (options: SetEnvelopeItemShapesOptions) => {
  const { userId, teamId, envelopeId, envelopeItemId, requestMetadata } = options;
  const shapes = ZEnvelopeShapesSchema.parse(options.shapes);
  const { envelopeWhereInput, team } = await getEnvelopeWhereInput({
    id: { type: 'envelopeId', id: envelopeId },
    type: null,
    userId,
    teamId,
  });
  const envelope = await prisma.envelope.findFirst({
    where: envelopeWhereInput,
    include: { envelopeItems: { include: { documentData: true } } },
  });

  if (!envelope) {
    throw new AppError(AppErrorCode.NOT_FOUND, { message: 'Envelope not found' });
  }

  assertCanManageTemplate({
    envelopeType: envelope.type,
    templateOwnerId: envelope.userId,
    currentTeamRole: team.currentTeamRole,
    userId,
  });

  if (!canEditEnvelopeShapes(envelope)) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Shapes are only editable in drafts or during an active correction',
      userMessage: 'Shapes can only be changed in a draft or an active correction.',
    });
  }

  const item = envelope.envelopeItems.find((item) => item.id === envelopeItemId);

  if (!item) {
    throw new AppError(AppErrorCode.NOT_FOUND, { message: 'Envelope item not found' });
  }

  const storedShapes = parseEnvelopeShapes(item.shapes);
  const previousShapes = ZEnvelopeShapesSchema.parse(options.previousShapes);
  // JSONB round-tripping can shift a coordinate by a floating-point rounding
  // unit. Compare numeric values within that precision, while retaining the
  // exact database JSON in the transactional compare-and-swap below.
  const matchesPreviousShapes =
    storedShapes.length === previousShapes.length &&
    storedShapes.every((shape, index) =>
      Object.entries({ ...shape, borderStyle: shape.borderStyle ?? 'solid', fillColor: shape.fillColor ?? null }).every(
        ([key, value]) => {
          const previousShape = {
            ...previousShapes[index],
            borderStyle: previousShapes[index].borderStyle ?? 'solid',
            fillColor: previousShapes[index].fillColor ?? null,
          };
          const previous = previousShape[key as keyof typeof shape];
          return typeof value === 'number' && typeof previous === 'number'
            ? Math.abs(value - previous) <= Number.EPSILON * Math.max(1, Math.abs(value), Math.abs(previous)) * 4
            : value === previous;
        },
      ),
    );

  if (!matchesPreviousShapes) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Shapes changed in another editor',
      userMessage: 'Shapes changed in another editor. Reload the document before making more changes.',
    });
  }

  const pageCounts = await getEnvelopeItemPageCounts([item]);
  const pageCount = pageCounts.get(envelopeItemId) ?? 0;

  if (shapes.some((shape) => shape.page > pageCount)) {
    throw new AppError(AppErrorCode.INVALID_BODY, { message: 'Shape page does not exist' });
  }

  // Compare-and-swap protects against concurrent editors and correction state changes.
  return await prisma.$transaction(async (tx) => {
    // Lock the parent through a conditional update, so sending/completing the
    // envelope cannot overtake an in-flight markup write.
    const writable = await tx.envelope.updateMany({
      where: {
        id: envelopeId,
        status: envelope.status,
        correctionStartedAt: envelope.correctionStartedAt,
        internalVersion: 2,
        completedAt: null,
        deletedAt: null,
      },
      data: { updatedAt: new Date() },
    });

    if (writable.count !== 1) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: 'Envelope state changed while saving shapes',
        userMessage: 'The document changed. Reload it before editing shapes again.',
      });
    }

    const updated = await tx.envelopeItem.updateMany({
      where: {
        id: envelopeItemId,
        envelopeId,
        shapes: { equals: item.shapes },
        envelope: {
          status: envelope.status,
          correctionStartedAt: envelope.correctionStartedAt,
          completedAt: null,
          deletedAt: null,
        },
      },
      data: { shapes },
    });

    if (updated.count !== 1) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: 'Envelope changed while saving shapes',
        userMessage: 'The document changed. Reload it before editing shapes again.',
      });
    }

    if (envelope.type === 'DOCUMENT' && JSON.stringify(item.shapes) !== JSON.stringify(shapes)) {
      await tx.documentAuditLog.create({
        data: createDocumentAuditLogData({
          type: DOCUMENT_AUDIT_LOG_TYPE.ENVELOPE_ITEM_UPDATED,
          envelopeId,
          data: {
            envelopeItemId,
            changes: [
              { field: 'shapes', from: JSON.stringify(parseEnvelopeShapes(item.shapes)), to: JSON.stringify(shapes) },
            ],
          },
          user: await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } }),
          requestMetadata: requestMetadata.requestMetadata,
        }),
      });
    }

    return { shapes };
  });
};
