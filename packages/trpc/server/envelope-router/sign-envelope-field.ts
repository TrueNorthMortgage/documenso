import { isBase64Image } from '@documenso/lib/constants/signatures';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { validateFieldAuth } from '@documenso/lib/server-only/document/validate-field-auth';
import { assertConditionalFieldIsVisible } from '@documenso/lib/server-only/field/assert-conditional-field-visible';
import { autoInsertConditionalFieldDefaults } from '@documenso/lib/server-only/field/auto-insert-conditional-field-defaults';
import { clearHiddenConditionalFields } from '@documenso/lib/server-only/field/clear-hidden-conditional-fields';
import { DOCUMENT_AUDIT_LOG_TYPE } from '@documenso/lib/types/document-audit-logs';
import { getConditionalFieldVisibility } from '@documenso/lib/universal/conditional-field-visibility';
import { createDocumentAuditLogData } from '@documenso/lib/utils/document-audit-logs';
import { extractFieldInsertionValues } from '@documenso/lib/utils/envelope-signing';
import { prisma } from '@documenso/prisma';
import type { Prisma } from '@prisma/client';
import { DocumentStatus, FieldType, RecipientRole, SigningStatus } from '@prisma/client';
import { match } from 'ts-pattern';

import { procedure } from '../trpc';
import { ZSignEnvelopeFieldRequestSchema, ZSignEnvelopeFieldResponseSchema } from './sign-envelope-field.types';

const getHiddenConditionalFieldIdsBeforeUpdate = async ({
  tx,
  envelopeItemId,
}: {
  tx: Prisma.TransactionClient;
  envelopeItemId: string;
}) => {
  const fields = await tx.field.findMany({
    where: {
      envelopeItemId,
    },
    include: {
      conditionalChildRule: true,
      envelope: {
        select: {
          internalVersion: true,
        },
      },
    },
  });

  const visibility = getConditionalFieldVisibility(
    fields.map((candidate) => ({
      ...candidate,
      envelopeInternalVersion: candidate.envelope.internalVersion,
    })),
  );

  return fields
    .filter((candidate) => candidate.conditionalChildRule && visibility.get(candidate.id) === false)
    .map((candidate) => candidate.id);
};

const createAutoInsertedFieldsAuditLog = async ({
  tx,
  envelopeId,
  fields,
}: {
  tx: Prisma.TransactionClient;
  envelopeId: string;
  fields: Array<{ id: number; type: FieldType; recipientId: number | null }>;
}) => {
  const auditFields = fields.filter((candidate): candidate is typeof candidate & { recipientId: number } => {
    return candidate.recipientId !== null;
  });

  if (auditFields.length === 0) {
    return;
  }

  await tx.documentAuditLog.create({
    data: createDocumentAuditLogData({
      type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_FIELDS_AUTO_INSERTED,
      envelopeId,
      data: {
        fields: auditFields.map((candidate) => ({
          fieldId: candidate.id,
          fieldType: candidate.type,
          recipientId: candidate.recipientId,
        })),
      },
    }),
  });
};

// Note that this is an unauthenticated public procedure route.
export const signEnvelopeFieldRoute = procedure
  .input(ZSignEnvelopeFieldRequestSchema)
  .output(ZSignEnvelopeFieldResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { user, metadata } = ctx;
    const { token, fieldId, fieldValue, authOptions } = input;

    ctx.logger.info({
      input: {
        fieldId,
      },
    });

    const recipient = await prisma.recipient.findFirst({
      where: {
        token,
      },
    });

    if (!recipient) {
      throw new AppError(AppErrorCode.NOT_FOUND);
    }

    const field = await prisma.field.findFirst({
      where: {
        id: fieldId,
        recipient: {
          ...(recipient.role === RecipientRole.ASSISTANT
            ? {
                signingStatus: {
                  not: SigningStatus.SIGNED,
                },
                signingOrder: {
                  gte: recipient.signingOrder ?? 0,
                },
                envelopeId: recipient.envelopeId,
              }
            : {
                id: recipient.id,
              }),
        },
      },
      include: {
        envelope: {
          include: {
            recipients: true,
            documentMeta: true,
          },
        },
        recipient: true,
      },
    });

    if (!field) {
      throw new AppError(AppErrorCode.NOT_FOUND, {
        message: `Field ${fieldId} not found`,
      });
    }

    const { envelope } = field;
    const { documentMeta } = envelope;

    if (envelope.internalVersion !== 2) {
      throw new AppError(AppErrorCode.NOT_FOUND, {
        message: `Envelope ${envelope.id} is not a version 2 envelope`,
      });
    }

    if (
      field.type === FieldType.SIGNATURE &&
      recipient.id !== field.recipientId &&
      recipient.role === RecipientRole.ASSISTANT
    ) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: `Assistant recipients cannot sign signature fields`,
      });
    }

    if (fieldValue.type !== field.type) {
      throw new AppError(AppErrorCode.NOT_FOUND, {
        message: 'Selected values do not match the field values',
      });
    }

    if (envelope.deletedAt) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: `Document ${envelope.id} has been deleted`,
      });
    }

    if (envelope.status !== DocumentStatus.PENDING) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: `Document ${envelope.id} must be pending for signing`,
      });
    }

    if (recipient.signingStatus === SigningStatus.SIGNED || field.recipient.signingStatus === SigningStatus.SIGNED) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: `Recipient ${recipient.id} has already signed`,
      });
    }

    if (field.fieldMeta?.readOnly) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: `Field ${fieldId} is read only`,
      });
    }

    await assertConditionalFieldIsVisible({
      fieldId: field.id,
      envelopeItemId: field.envelopeItemId,
    });

    // Unreachable code based on the above query but we need to satisfy TypeScript
    if (field.recipientId === null) {
      throw new Error(`Field ${fieldId} has no recipientId`);
    }

    const insertionValues = extractFieldInsertionValues({ fieldValue, field, documentMeta });

    // Early return for uninserting fields.
    if (!insertionValues.inserted) {
      return await prisma.$transaction(async (tx) => {
        const previouslyHiddenFieldIds = await getHiddenConditionalFieldIdsBeforeUpdate({
          tx,
          envelopeItemId: field.envelopeItemId,
        });

        const updatedField = await tx.field.update({
          where: {
            id: field.id,
          },
          data: {
            customText: '',
            inserted: false,
          },
        });

        const clearedFieldIds = await clearHiddenConditionalFields({
          tx,
          envelopeItemId: field.envelopeItemId,
        });

        const autoInsertedFields = await autoInsertConditionalFieldDefaults({
          tx,
          envelopeItemId: field.envelopeItemId,
          fieldIds: previouslyHiddenFieldIds,
          documentMeta,
        });

        await createAutoInsertedFieldsAuditLog({
          tx,
          envelopeId: envelope.id,
          fields: autoInsertedFields,
        });

        await tx.signature.deleteMany({
          where: {
            fieldId: field.id,
          },
        });

        if (recipient.role !== RecipientRole.ASSISTANT) {
          await tx.documentAuditLog.create({
            data: createDocumentAuditLogData({
              type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_FIELD_UNINSERTED,
              envelopeId: envelope.id,
              user: {
                name: recipient.name,
                email: recipient.email,
              },
              requestMetadata: metadata.requestMetadata,
              data: {
                field: field.type,
                fieldId: field.secondaryId,
              },
            }),
          });
        }

        return {
          signedField: updatedField,
          clearedFieldIds,
          autoInsertedFields,
        };
      });
    }

    const derivedRecipientActionAuth = await validateFieldAuth({
      documentAuthOptions: envelope.authOptions,
      recipient,
      field,
      userId: user?.id,
      authOptions,
    });

    const assistant = recipient.role === RecipientRole.ASSISTANT ? recipient : undefined;

    let signatureImageAsBase64 = null;
    let typedSignature = null;
    let typedSignatureFont = null;

    if (field.type === FieldType.SIGNATURE) {
      if (fieldValue.type !== FieldType.SIGNATURE) {
        throw new AppError(AppErrorCode.INVALID_REQUEST, {
          message: `Field ${fieldId} is not a signature field`,
        });
      }

      if (fieldValue.value) {
        const isBase64 = isBase64Image(fieldValue.value);

        signatureImageAsBase64 = isBase64 ? fieldValue.value : null;
        typedSignature = !isBase64 ? fieldValue.value : null;
        typedSignatureFont = !isBase64 ? (fieldValue.signatureFont ?? null) : null;
      }
    }

    return await prisma.$transaction(async (tx) => {
      const previouslyHiddenFieldIds = await getHiddenConditionalFieldIdsBeforeUpdate({
        tx,
        envelopeItemId: field.envelopeItemId,
      });

      const updatedField = await tx.field.update({
        where: {
          id: field.id,
        },
        data: {
          customText: insertionValues.customText,
          inserted: insertionValues.inserted,
        },
        include: {
          signature: true,
        },
      });

      const clearedFieldIds = await clearHiddenConditionalFields({
        tx,
        envelopeItemId: field.envelopeItemId,
      });

      const autoInsertedFields = await autoInsertConditionalFieldDefaults({
        tx,
        envelopeItemId: field.envelopeItemId,
        fieldIds: previouslyHiddenFieldIds,
        documentMeta,
      });

      await createAutoInsertedFieldsAuditLog({
        tx,
        envelopeId: envelope.id,
        fields: autoInsertedFields,
      });

      if (field.type === FieldType.SIGNATURE) {
        const signature = await tx.signature.upsert({
          where: {
            fieldId: field.id,
          },
          create: {
            fieldId: field.id,
            recipientId: field.recipientId,
            signatureImageAsBase64: signatureImageAsBase64,
            typedSignature: typedSignature,
            typedSignatureFont,
          },
          update: {
            signatureImageAsBase64: signatureImageAsBase64,
            typedSignature: typedSignature,
            typedSignatureFont,
          },
        });

        // Dirty but I don't want to deal with type information
        Object.assign(updatedField, {
          signature,
        });
      }

      await tx.documentAuditLog.create({
        data: createDocumentAuditLogData({
          type:
            assistant && field.recipientId !== assistant.id
              ? DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_FIELD_PREFILLED
              : DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_FIELD_INSERTED,
          envelopeId: envelope.id,
          user: {
            email: assistant?.email ?? recipient.email,
            name: assistant?.name ?? recipient.name,
          },
          requestMetadata: metadata.requestMetadata,
          data: {
            recipientEmail: recipient.email,
            recipientId: recipient.id,
            recipientName: recipient.name,
            recipientRole: recipient.role,
            fieldId: updatedField.secondaryId,
            field: match(updatedField.type)
              .with(FieldType.SIGNATURE, FieldType.FREE_SIGNATURE, (type) => ({
                type,
                data: signatureImageAsBase64 || typedSignature || '',
              }))
              .with(FieldType.DATE, FieldType.EMAIL, FieldType.NAME, FieldType.TEXT, FieldType.INITIALS, (type) => ({
                type,
                data: updatedField.customText,
              }))
              .with(FieldType.NUMBER, FieldType.RADIO, FieldType.CHECKBOX, FieldType.DROPDOWN, (type) => ({
                type,
                data: updatedField.customText,
              }))
              .exhaustive(),
            fieldSecurity: derivedRecipientActionAuth
              ? {
                  type: derivedRecipientActionAuth,
                }
              : undefined,
          },
        }),
      });

      return {
        signedField: updatedField,
        clearedFieldIds,
        autoInsertedFields,
      };
    });
  });
