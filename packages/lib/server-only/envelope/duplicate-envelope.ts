import { prisma } from '@documenso/prisma';
import { DocumentSource, EnvelopeType, WebhookTriggerEvents } from '@prisma/client';
import pMap from 'p-map';
import { omit } from 'remeda';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { mapEnvelopeToWebhookDocumentPayload, ZWebhookDocumentSchema } from '../../types/webhook-payload';
import { nanoid, prefixedId } from '../../universal/id';
import type { EnvelopeIdOptions } from '../../utils/envelope';
import { getEnvelopeWhereInput } from '../envelope/get-envelope-by-id';
import { incrementDocumentId, incrementTemplateId } from '../envelope/increment-id';
import { triggerWebhook } from '../webhooks/trigger/trigger-webhook';

export interface DuplicateEnvelopeOptions {
  id: EnvelopeIdOptions;
  userId: number;
  teamId: number;
  overrides?: {
    duplicateAsTemplate?: boolean;
    includeRecipients?: boolean;
    includeFields?: boolean;
  };
}

export const duplicateEnvelope = async ({ id, userId, teamId, overrides }: DuplicateEnvelopeOptions) => {
  const { duplicateAsTemplate = false, includeRecipients = true, includeFields = true } = overrides ?? {};

  const { envelopeWhereInput } = await getEnvelopeWhereInput({
    id,
    type: null,
    userId,
    teamId,
  });

  const envelope = await prisma.envelope.findFirst({
    where: envelopeWhereInput,
    select: {
      type: true,
      title: true,
      userId: true,
      internalVersion: true,
      templateType: true,
      publicTitle: true,
      publicDescription: true,
      envelopeItems: {
        include: {
          documentData: {
            select: {
              data: true,
              initialData: true,
              type: true,
            },
          },
        },
      },
      authOptions: true,
      visibility: true,
      documentMeta: true,
      recipients: {
        select: {
          email: true,
          name: true,
          role: true,
          signingOrder: true,
          fields: {
            include: {
              conditionalChildRule: true,
              fieldGroup: true,
            },
          },
        },
      },
      teamId: true,
    },
  });

  if (!envelope) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Document not found',
    });
  }

  if (duplicateAsTemplate && envelope.type !== EnvelopeType.DOCUMENT) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Only documents can be saved as templates',
    });
  }

  const targetType = duplicateAsTemplate ? EnvelopeType.TEMPLATE : envelope.type;

  const [{ legacyNumberId, secondaryId }, createdDocumentMeta] = await Promise.all([
    targetType === EnvelopeType.DOCUMENT
      ? incrementDocumentId().then(({ documentId, formattedDocumentId }) => ({
          legacyNumberId: documentId,
          secondaryId: formattedDocumentId,
        }))
      : incrementTemplateId().then(({ templateId, formattedTemplateId }) => ({
          legacyNumberId: templateId,
          secondaryId: formattedTemplateId,
        })),
    prisma.documentMeta.create({
      data: {
        ...omit(envelope.documentMeta, ['id']),
        emailSettings: envelope.documentMeta.emailSettings || undefined,
      },
    }),
  ]);

  const duplicatedTemplateType =
    envelope.templateType === 'ORGANISATION' && envelope.teamId !== teamId
      ? 'PRIVATE'
      : (envelope.templateType ?? undefined);

  const duplicatedEnvelope = await prisma.envelope.create({
    data: {
      id: prefixedId('envelope'),
      secondaryId,
      type: targetType,
      internalVersion: envelope.internalVersion,
      userId,
      teamId,
      title: envelope.title + ' (copy)',
      documentMetaId: createdDocumentMeta.id,
      authOptions: envelope.authOptions || undefined,
      visibility: envelope.visibility,
      templateType: duplicatedTemplateType,
      publicTitle: envelope.publicTitle ?? undefined,
      publicDescription: envelope.publicDescription ?? undefined,
      source: targetType === EnvelopeType.DOCUMENT ? DocumentSource.DOCUMENT : DocumentSource.TEMPLATE,
    },
    include: {
      recipients: true,
      documentMeta: true,
    },
  });

  // Key = original envelope item ID
  // Value = duplicated envelope item ID.
  const oldEnvelopeItemToNewEnvelopeItemIdMap: Record<string, string> = {};

  // Duplicate the envelope items.
  await Promise.all(
    envelope.envelopeItems.map(async (envelopeItem) => {
      const duplicatedDocumentData = await prisma.documentData.create({
        data: {
          type: envelopeItem.documentData.type,
          data: envelopeItem.documentData.initialData,
          initialData: envelopeItem.documentData.initialData,
        },
      });

      const duplicatedEnvelopeItem = await prisma.envelopeItem.create({
        data: {
          id: prefixedId('envelope_item'),
          title: envelopeItem.title,
          order: envelopeItem.order,
          envelopeId: duplicatedEnvelope.id,
          documentDataId: duplicatedDocumentData.id,
        },
      });

      oldEnvelopeItemToNewEnvelopeItemIdMap[envelopeItem.id] = duplicatedEnvelopeItem.id;
    }),
  );

  const duplicatedFieldIdsBySourceId = new Map<number, number>();
  const duplicatedFieldGroupIdsBySourceId = new Map<string, string>();

  if (includeRecipients) {
    await pMap(
      envelope.recipients,
      async (recipient) => {
        const duplicatedRecipient = await prisma.recipient.create({
          data: {
            envelopeId: duplicatedEnvelope.id,
            email: recipient.email,
            name: recipient.name,
            role: recipient.role,
            signingOrder: recipient.signingOrder,
            token: nanoid(),
          },
        });

        if (includeFields) {
          const sourceGroups = recipient.fields.reduce<NonNullable<(typeof recipient.fields)[number]['fieldGroup']>[]>(
            (groups, field) => {
              if (field.fieldGroup && !groups.some((group) => group.id === field.fieldGroup?.id)) {
                groups.push(field.fieldGroup);
              }

              return groups;
            },
            [],
          );

          await Promise.all(
            sourceGroups
              .filter((group) => !duplicatedFieldGroupIdsBySourceId.has(group.id))
              .map(async (group) => {
                const duplicatedFieldGroup = await prisma.fieldGroup.create({
                  data: {
                    id: nanoid(12),
                    name: group.name,
                    type: group.type,
                    groupType: group.groupType,
                    required: group.required,
                    readOnly: group.readOnly,
                    fontSize: group.fontSize,
                    direction: group.direction,
                    validationRule: group.validationRule,
                    validationLength: group.validationLength,
                    envelopeId: duplicatedEnvelope.id,
                    envelopeItemId: oldEnvelopeItemToNewEnvelopeItemIdMap[group.envelopeItemId],
                    recipientId: duplicatedRecipient.id,
                  },
                });

                duplicatedFieldGroupIdsBySourceId.set(group.id, duplicatedFieldGroup.id);
              }),
          );

          const duplicatedFields = await Promise.all(
            recipient.fields.map((field) => {
              const duplicatedFieldGroupId = field.fieldGroup
                ? duplicatedFieldGroupIdsBySourceId.get(field.fieldGroup.id)
                : undefined;

              return prisma.field.create({
                data: {
                  envelopeId: duplicatedEnvelope.id,
                  envelopeItemId: oldEnvelopeItemToNewEnvelopeItemIdMap[field.envelopeItemId],
                  recipientId: duplicatedRecipient.id,
                  type: field.type,
                  page: field.page,
                  positionX: field.positionX,
                  positionY: field.positionY,
                  width: field.width,
                  height: field.height,
                  customText: '',
                  inserted: false,
                  fieldMeta: field.fieldMeta as PrismaJson.FieldMeta,
                  fieldGroupId: duplicatedFieldGroupId ?? null,
                },
              });
            }),
          );

          recipient.fields.forEach((field, index) => {
            duplicatedFieldIdsBySourceId.set(field.id, duplicatedFields[index].id);
          });
        }

        return duplicatedRecipient;
      },
      { concurrency: 5 },
    );
  }

  if (includeFields && duplicatedFieldIdsBySourceId.size > 0) {
    const conditionalRules = envelope.recipients.flatMap((recipient) =>
      recipient.fields.flatMap((field) => {
        const rule = field.conditionalChildRule;
        const childFieldId = duplicatedFieldIdsBySourceId.get(field.id);
        const parentFieldId = rule ? duplicatedFieldIdsBySourceId.get(rule.parentFieldId) : undefined;

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
      }),
    );

    if (conditionalRules.length > 0) {
      await prisma.conditionalFieldRule.createMany({ data: conditionalRules });
    }
  }

  if (duplicatedEnvelope.type === EnvelopeType.DOCUMENT) {
    const refetchedEnvelope = await prisma.envelope.findFirstOrThrow({
      where: {
        id: duplicatedEnvelope.id,
      },
      include: {
        documentMeta: true,
        recipients: true,
      },
    });

    await triggerWebhook({
      event: WebhookTriggerEvents.DOCUMENT_CREATED,
      data: ZWebhookDocumentSchema.parse(mapEnvelopeToWebhookDocumentPayload(refetchedEnvelope)),
      userId: userId,
      teamId: teamId,
    });
  }

  return {
    id: duplicatedEnvelope.id,
    envelope: duplicatedEnvelope,
    legacyId: {
      type: duplicatedEnvelope.type,
      id: legacyNumberId,
    },
  };
};
