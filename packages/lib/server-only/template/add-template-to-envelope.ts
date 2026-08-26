import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { DOCUMENT_AUDIT_LOG_TYPE } from '@documenso/lib/types/document-audit-logs';
import type { ApiRequestMetadata } from '@documenso/lib/universal/extract-request-metadata';
import { nanoid, prefixedId } from '@documenso/lib/universal/id';
import { getFileServerSide } from '@documenso/lib/universal/upload/get-file.server';
import { putNormalizedPdfFileServerSide } from '@documenso/lib/universal/upload/put-file.server';
import { createDocumentAuditLogData } from '@documenso/lib/utils/document-audit-logs';
import { getEnvelopeItemPermissions } from '@documenso/lib/utils/envelope';
import { prisma } from '@documenso/prisma';
import { DocumentStatus, EnvelopeType } from '@prisma/client';

import { canRecipientFieldsBeModified } from '../../utils/recipients';
import { getEnvelopeWhereInput } from '../envelope/get-envelope-by-id';
import { getAccessibleTemplate, resolveTemplateRecipient } from './apply-template-to-envelope-item';

export type AddTemplateToEnvelopeOptions = {
  userId: number;
  teamId: number;
  envelopeId: string;
  templateId: number;
  templateItemId: string;
  requestMetadata: ApiRequestMetadata;
};

export const addTemplateToEnvelope = async ({
  userId,
  teamId,
  envelopeId,
  templateId,
  templateItemId,
  requestMetadata,
}: AddTemplateToEnvelopeOptions) => {
  const { envelopeWhereInput } = await getEnvelopeWhereInput({
    id: { type: 'envelopeId', id: envelopeId },
    type: EnvelopeType.DOCUMENT,
    userId,
    teamId,
  });

  const [envelope, template] = await Promise.all([
    prisma.envelope.findFirst({
      where: envelopeWhereInput,
      include: {
        recipients: true,
        fields: true,
        envelopeItems: true,
        team: {
          select: {
            organisation: {
              select: {
                organisationClaim: true,
              },
            },
          },
        },
      },
    }),
    getAccessibleTemplate({ templateId, userId, teamId }),
  ]);

  if (!envelope || envelope.status !== DocumentStatus.DRAFT) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Only draft documents can have templates added',
      userMessage: 'Templates can only be added to draft documents.',
    });
  }

  const { canFileBeChanged } = getEnvelopeItemPermissions(envelope, envelope.recipients);

  if (!canFileBeChanged) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Envelope item is not editable',
    });
  }

  if (envelope.envelopeItems.length >= envelope.team.organisation.organisationClaim.envelopeItemCount) {
    throw new AppError('ENVELOPE_ITEM_LIMIT_EXCEEDED', {
      message: `You cannot add more than ${envelope.team.organisation.organisationClaim.envelopeItemCount} envelope items`,
      statusCode: 400,
    });
  }

  const sourceEnvelopeItem = await prisma.envelopeItem.findFirst({
    where: {
      id: templateItemId,
      envelopeId: 'envelopeId' in template ? template.envelopeId : template.id,
    },
    include: {
      documentData: true,
    },
  });

  if (!sourceEnvelopeItem?.documentData) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Template item not found',
    });
  }

  const sourceFields = template.fields.filter((field) => field.envelopeItemId === templateItemId);
  const recipientMap = new Map<number, number>();

  for (const sourceField of sourceFields) {
    if (recipientMap.has(sourceField.recipientId)) {
      continue;
    }

    const templateRecipient = template.recipients.find((recipient) => recipient.id === sourceField.recipientId);

    if (!templateRecipient) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: `Template recipient ${sourceField.recipientId} not found`,
      });
    }

    const recipient = resolveTemplateRecipient({
      templateRecipient,
      recipients: envelope.recipients,
    });

    if (!canRecipientFieldsBeModified(recipient, envelope.fields)) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: `Recipient ${recipient.id} cannot be modified`,
        userMessage: 'One of the recipients can no longer have fields modified.',
      });
    }

    recipientMap.set(sourceField.recipientId, recipient.id);
  }

  const sourceBuffer = await getFileServerSide(sourceEnvelopeItem.documentData);
  const duplicatedFile = await putNormalizedPdfFileServerSide({
    name: sourceEnvelopeItem.title,
    type: 'application/pdf',
    arrayBuffer: async () => Promise.resolve(sourceBuffer),
  });
  const documentData = await prisma.documentData.create({
    data: {
      type: duplicatedFile.type,
      data: duplicatedFile.data,
      initialData: sourceEnvelopeItem.documentData.data,
    },
  });

  const envelopeItemId = prefixedId('envelope_item');
  const order = Math.max(0, ...envelope.envelopeItems.map((item) => item.order)) + 1;

  const created = await prisma.$transaction(async (tx) => {
    const envelopeItem = await tx.envelopeItem.create({
      data: {
        id: envelopeItemId,
        envelopeId,
        title: sourceEnvelopeItem.title.endsWith('.pdf')
          ? sourceEnvelopeItem.title.slice(0, -4)
          : sourceEnvelopeItem.title,
        documentDataId: documentData.id,
        order,
      },
      include: {
        documentData: true,
      },
    });

    const fieldGroupIdMap = new Map<string, string>();

    for (const sourceField of sourceFields) {
      if (!sourceField.fieldGroupId || !sourceField.fieldGroup || fieldGroupIdMap.has(sourceField.fieldGroupId)) {
        continue;
      }

      const recipientId = recipientMap.get(sourceField.fieldGroup.recipientId);

      if (!recipientId) {
        throw new AppError(AppErrorCode.INVALID_REQUEST, {
          message: `Could not map template field group recipient ${sourceField.fieldGroup.recipientId}`,
        });
      }

      const fieldGroupId = nanoid(12);
      fieldGroupIdMap.set(sourceField.fieldGroupId, fieldGroupId);

      await tx.fieldGroup.create({
        data: {
          id: fieldGroupId,
          name: sourceField.fieldGroup.name,
          type: sourceField.fieldGroup.type,
          groupType: sourceField.fieldGroup.groupType,
          required: sourceField.fieldGroup.required,
          readOnly: sourceField.fieldGroup.readOnly,
          fontSize: sourceField.fieldGroup.fontSize,
          direction: sourceField.fieldGroup.direction,
          validationRule: sourceField.fieldGroup.validationRule,
          validationLength: sourceField.fieldGroup.validationLength,
          envelopeId,
          envelopeItemId,
          recipientId,
        },
      });
    }

    const fields = await Promise.all(
      sourceFields.map((sourceField) => {
        const recipientId = recipientMap.get(sourceField.recipientId);

        if (!recipientId) {
          throw new AppError(AppErrorCode.INVALID_REQUEST, {
            message: `Could not map template recipient ${sourceField.recipientId}`,
          });
        }

        return tx.field.create({
          data: {
            envelopeId,
            envelopeItemId,
            recipientId,
            type: sourceField.type,
            page: sourceField.page,
            positionX: sourceField.positionX,
            positionY: sourceField.positionY,
            width: sourceField.width,
            height: sourceField.height,
            customText: '',
            inserted: false,
            templateSourceItemId: templateItemId,
            fieldMeta: sourceField.fieldMeta ?? undefined,
            fieldGroupId: sourceField.fieldGroupId ? (fieldGroupIdMap.get(sourceField.fieldGroupId) ?? null) : null,
          },
        });
      }),
    );

    const createdFieldBySourceId = new Map(
      sourceFields.map((sourceField, index) => [sourceField.id, fields[index].id]),
    );
    const conditionalRules = sourceFields.flatMap((sourceField) => {
      const rule = sourceField.conditionalChildRule;
      const childFieldId = createdFieldBySourceId.get(sourceField.id);
      const parentFieldId = rule ? createdFieldBySourceId.get(rule.parentFieldId) : undefined;

      if (!rule || !childFieldId || !parentFieldId) {
        return [];
      }

      return [
        {
          childFieldId,
          parentFieldId,
          operator: rule.operator,
          value: rule.value,
        },
      ];
    });

    if (conditionalRules.length > 0) {
      await tx.conditionalFieldRule.createMany({ data: conditionalRules });
    }

    await tx.documentAuditLog.create({
      data: createDocumentAuditLogData({
        type: DOCUMENT_AUDIT_LOG_TYPE.ENVELOPE_ITEM_CREATED,
        envelopeId,
        metadata: requestMetadata,
        data: {
          envelopeItemId,
          envelopeItemTitle: envelopeItem.title,
        },
      }),
    });

    if (fields.length > 0) {
      await tx.documentAuditLog.createMany({
        data: fields.map((field) =>
          createDocumentAuditLogData({
            type: DOCUMENT_AUDIT_LOG_TYPE.FIELD_CREATED,
            envelopeId,
            metadata: requestMetadata,
            data: {
              fieldId: field.secondaryId,
              fieldRecipientEmail:
                envelope.recipients.find((recipient) => recipient.id === field.recipientId)?.email ?? '',
              fieldRecipientId: field.recipientId,
              fieldType: field.type,
            },
          }),
        ),
      });
    }

    return { envelopeItem, fields };
  });

  return created;
};
