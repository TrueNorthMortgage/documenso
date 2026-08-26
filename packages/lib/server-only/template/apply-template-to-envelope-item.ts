import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { DOCUMENT_AUDIT_LOG_TYPE } from '@documenso/lib/types/document-audit-logs';
import type { ApiRequestMetadata } from '@documenso/lib/universal/extract-request-metadata';
import { nanoid } from '@documenso/lib/universal/id';
import { createDocumentAuditLogData } from '@documenso/lib/utils/document-audit-logs';
import { prisma } from '@documenso/prisma';
import {
  DocumentStatus,
  EnvelopeType,
  type FieldGroup,
  type Prisma,
  type Recipient,
  RecipientRole,
  SendStatus,
  SigningStatus,
} from '@prisma/client';

import { canRecipientFieldsBeModified } from '../../utils/recipients';
import { getEnvelopeWhereInput } from '../envelope/get-envelope-by-id';
import { getOrganisationTemplateById } from './get-organisation-template-by-id';
import { getTemplateById } from './get-template-by-id';

export type ApplyTemplateToEnvelopeItemOptions = {
  userId: number;
  teamId: number;
  envelopeId: string;
  envelopeItemId: string;
  templateId: number;
  templateItemId: string;
  replaceExistingFields: boolean;
  requestMetadata: ApiRequestMetadata;
};

export type RemoveTemplateFromEnvelopeItemOptions = {
  userId: number;
  teamId: number;
  envelopeId: string;
  envelopeItemId: string;
  requestMetadata: ApiRequestMetadata;
};

type TemplateRecipientReference = Pick<Recipient, 'id' | 'role' | 'signingOrder'>;
type TemplateRecipientToCreate = Pick<Recipient, 'id' | 'role' | 'signingOrder'>;
type TemplateFieldGroup = Pick<
  FieldGroup,
  | 'id'
  | 'name'
  | 'type'
  | 'groupType'
  | 'required'
  | 'readOnly'
  | 'fontSize'
  | 'direction'
  | 'validationRule'
  | 'validationLength'
  | 'envelopeItemId'
  | 'recipientId'
>;
type TemplateFieldWithGroup = {
  fieldGroupId: string | null;
  fieldGroup: TemplateFieldGroup | null;
};

const getTemplateRecipientCandidates = <T extends TemplateRecipientReference>({
  templateRecipient,
  recipients,
}: {
  templateRecipient: TemplateRecipientReference;
  recipients: T[];
}) => {
  const compatibleRecipients = recipients.filter((recipient) => recipient.role === templateRecipient.role);
  const sameSigningOrder = compatibleRecipients.filter(
    (recipient) => recipient.signingOrder === templateRecipient.signingOrder,
  );

  return sameSigningOrder.length > 0 ? sameSigningOrder : compatibleRecipients;
};

export const getAccessibleTemplate = async ({
  templateId,
  userId,
  teamId,
}: Pick<ApplyTemplateToEnvelopeItemOptions, 'templateId' | 'userId' | 'teamId'>) => {
  try {
    return await getTemplateById({
      id: { type: 'templateId', id: templateId },
      userId,
      teamId,
    });
  } catch (error) {
    const appError = AppError.parseError(error);

    if (appError.code !== AppErrorCode.NOT_FOUND) {
      throw error;
    }

    return await getOrganisationTemplateById({
      id: { type: 'templateId', id: templateId },
      userId,
      teamId,
    });
  }
};

export const resolveTemplateRecipient = <T extends TemplateRecipientReference>({
  templateRecipient,
  recipients,
}: {
  templateRecipient: TemplateRecipientReference;
  recipients: T[];
}): T => {
  const candidates = getTemplateRecipientCandidates({ templateRecipient, recipients });

  if (candidates.length !== 1) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: `Could not uniquely map template recipient ${templateRecipient.id}`,
      userMessage: 'The template recipients do not match the recipients on this document.',
    });
  }

  return candidates[0];
};

export const resolveTemplateRecipients = <T extends TemplateRecipientReference>({
  templateRecipients,
  recipients,
}: {
  templateRecipients: TemplateRecipientReference[];
  recipients: T[];
}) => {
  const availableRecipients = [...recipients];
  const recipientMap = new Map<number, number>();
  const unmappedTemplateRecipientIds: number[] = [];

  for (const templateRecipient of templateRecipients) {
    const candidates = getTemplateRecipientCandidates({
      templateRecipient,
      recipients: availableRecipients,
    });

    if (candidates.length > 1) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: `Could not uniquely map template recipient ${templateRecipient.id}`,
        userMessage: 'The template recipients do not match the recipients on this document.',
      });
    }

    const recipient = candidates[0];

    if (!recipient) {
      unmappedTemplateRecipientIds.push(templateRecipient.id);
      continue;
    }

    recipientMap.set(templateRecipient.id, recipient.id);
    availableRecipients.splice(availableRecipients.indexOf(recipient), 1);
  }

  return {
    recipientMap,
    unmappedTemplateRecipientIds,
  };
};

export const createTemplateRecipients = async ({
  tx,
  envelopeId,
  templateRecipients,
  requestMetadata,
}: {
  tx: Prisma.TransactionClient;
  envelopeId: string;
  templateRecipients: TemplateRecipientToCreate[];
  requestMetadata: ApiRequestMetadata;
}) => {
  return await Promise.all(
    templateRecipients.map(async (templateRecipient) => {
      const authOptions = {
        accessAuth: [],
        actionAuth: [],
      };
      const recipient = await tx.recipient.create({
        data: {
          envelopeId,
          name: '',
          email: '',
          role: templateRecipient.role,
          signingOrder: templateRecipient.signingOrder,
          token: nanoid(),
          authOptions,
          sendStatus: templateRecipient.role === RecipientRole.CC ? SendStatus.SENT : SendStatus.NOT_SENT,
          signingStatus: templateRecipient.role === RecipientRole.CC ? SigningStatus.SIGNED : SigningStatus.NOT_SIGNED,
        },
      });

      await tx.documentAuditLog.create({
        data: createDocumentAuditLogData({
          type: DOCUMENT_AUDIT_LOG_TYPE.RECIPIENT_CREATED,
          envelopeId,
          metadata: requestMetadata,
          data: {
            recipientEmail: recipient.email,
            recipientName: recipient.name,
            recipientId: recipient.id,
            recipientRole: recipient.role,
            accessAuth: authOptions.accessAuth,
            actionAuth: authOptions.actionAuth,
          },
        }),
      });

      return recipient;
    }),
  );
};

export const createTemplateFieldGroups = async ({
  tx,
  envelopeId,
  envelopeItemId,
  sourceFields,
  recipientMap,
}: {
  tx: Prisma.TransactionClient;
  envelopeId: string;
  envelopeItemId: string;
  sourceFields: TemplateFieldWithGroup[];
  recipientMap: Map<number, number>;
}) => {
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

  return fieldGroupIdMap;
};

const getEnvelopeForTemplateAction = async ({
  envelopeId,
  envelopeItemId,
  userId,
  teamId,
}: Pick<ApplyTemplateToEnvelopeItemOptions, 'envelopeId' | 'envelopeItemId' | 'userId' | 'teamId'>) => {
  const { envelopeWhereInput } = await getEnvelopeWhereInput({
    id: { type: 'envelopeId', id: envelopeId },
    type: EnvelopeType.DOCUMENT,
    userId,
    teamId,
  });

  const envelope = await prisma.envelope.findFirst({
    where: envelopeWhereInput,
    include: {
      recipients: true,
      fields: true,
      envelopeItems: true,
    },
  });

  if (!envelope || envelope.status !== DocumentStatus.DRAFT) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Only draft documents can have templates applied',
      userMessage: 'Templates can only be applied to draft documents.',
    });
  }

  if (!envelope.envelopeItems.some((item) => item.id === envelopeItemId)) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Envelope item not found',
    });
  }

  return envelope;
};

export const applyTemplateToEnvelopeItem = async ({
  userId,
  teamId,
  envelopeId,
  envelopeItemId,
  templateId,
  templateItemId,
  replaceExistingFields,
  requestMetadata,
}: ApplyTemplateToEnvelopeItemOptions) => {
  const [envelope, template] = await Promise.all([
    getEnvelopeForTemplateAction({ envelopeId, envelopeItemId, userId, teamId }),
    getAccessibleTemplate({ templateId, userId, teamId }),
  ]);

  if (!template.envelopeItems.some((item) => item.id === templateItemId)) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Template item not found',
    });
  }

  const sourceFields = template.fields.filter((field) => field.envelopeItemId === templateItemId);

  if (sourceFields.length === 0) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Template item has no fields',
      userMessage: 'This template document has no fields to apply.',
    });
  }

  const targetFields = envelope.fields.filter((field) => field.envelopeItemId === envelopeItemId);

  if (targetFields.length > 0 && !replaceExistingFields) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Existing fields require confirmation before replacement',
      userMessage: 'This document already has fields. Confirm replacement before applying the template.',
    });
  }

  const templateRecipientIds = [...new Set(sourceFields.map((field) => field.recipientId))];
  const templateRecipients = templateRecipientIds.map((templateRecipientId) => {
    const templateRecipient = template.recipients.find((recipient) => recipient.id === templateRecipientId);

    if (!templateRecipient) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: `Template recipient ${templateRecipientId} not found`,
      });
    }

    return templateRecipient;
  });

  const { recipientMap, unmappedTemplateRecipientIds } = resolveTemplateRecipients({
    templateRecipients,
    recipients: envelope.recipients,
  });

  for (const recipientId of recipientMap.values()) {
    const recipient = envelope.recipients.find((candidate) => candidate.id === recipientId);

    if (recipient && !canRecipientFieldsBeModified(recipient, envelope.fields)) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: `Recipient ${recipient.id} cannot be modified`,
        userMessage: 'One of the recipients can no longer have fields modified.',
      });
    }
  }

  const createdFields = await prisma.$transaction(async (tx) => {
    const unmappedTemplateRecipients = templateRecipients.filter((recipient) =>
      unmappedTemplateRecipientIds.includes(recipient.id),
    );
    const createdRecipients = await createTemplateRecipients({
      tx,
      envelopeId,
      templateRecipients: unmappedTemplateRecipients,
      requestMetadata,
    });

    createdRecipients.forEach((recipient, index) => {
      const templateRecipient = unmappedTemplateRecipients[index];

      if (templateRecipient) {
        recipientMap.set(templateRecipient.id, recipient.id);
      }
    });

    const fieldGroupIdMap = await createTemplateFieldGroups({
      tx,
      envelopeId,
      envelopeItemId,
      sourceFields,
      recipientMap,
    });

    if (targetFields.length > 0) {
      await tx.field.deleteMany({
        where: {
          id: { in: targetFields.map((field) => field.id) },
        },
      });

      await tx.documentAuditLog.createMany({
        data: targetFields.map((field) =>
          createDocumentAuditLogData({
            type: DOCUMENT_AUDIT_LOG_TYPE.FIELD_DELETED,
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

    const fields = await Promise.all(
      sourceFields.map((field) => {
        const recipientId = recipientMap.get(field.recipientId);

        if (!recipientId) {
          throw new AppError(AppErrorCode.INVALID_REQUEST, {
            message: `Could not map template recipient ${field.recipientId}`,
          });
        }

        return tx.field.create({
          data: {
            envelopeId,
            envelopeItemId,
            recipientId,
            type: field.type,
            page: field.page,
            positionX: field.positionX,
            positionY: field.positionY,
            width: field.width,
            height: field.height,
            customText: field.customText,
            inserted: false,
            fieldMeta: field.fieldMeta ?? undefined,
            templateSourceItemId: templateItemId,
            fieldGroupId: field.fieldGroupId ? (fieldGroupIdMap.get(field.fieldGroupId) ?? null) : null,
          },
        });
      }),
    );

    const createdFieldBySourceId = new Map(sourceFields.map((field, index) => [field.id, fields[index].id]));
    const conditionalRules = sourceFields.flatMap((field) => {
      const rule = field.conditionalChildRule;
      const childFieldId = createdFieldBySourceId.get(field.id);
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

    return fields;
  });

  return { fields: createdFields };
};

export const removeTemplateFromEnvelopeItem = async ({
  userId,
  teamId,
  envelopeId,
  envelopeItemId,
  requestMetadata,
}: RemoveTemplateFromEnvelopeItemOptions) => {
  const envelope = await getEnvelopeForTemplateAction({ envelopeId, envelopeItemId, userId, teamId });
  const templateFields = envelope.fields.filter(
    (field) => field.envelopeItemId === envelopeItemId && field.templateSourceItemId !== null,
  );

  if (templateFields.length === 0) {
    return { fields: envelope.fields };
  }

  await prisma.$transaction(async (tx) => {
    await tx.field.deleteMany({
      where: {
        id: { in: templateFields.map((field) => field.id) },
      },
    });

    await tx.documentAuditLog.createMany({
      data: templateFields.map((field) =>
        createDocumentAuditLogData({
          type: DOCUMENT_AUDIT_LOG_TYPE.FIELD_DELETED,
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
  });

  return {
    fields: envelope.fields.filter((field) => !templateFields.some((templateField) => templateField.id === field.id)),
  };
};
