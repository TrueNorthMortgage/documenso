import { resolveExpiresAt } from '@documenso/lib/constants/envelope-expiration';
import { DOCUMENT_AUDIT_LOG_TYPE } from '@documenso/lib/types/document-audit-logs';
import type { ApiRequestMetadata } from '@documenso/lib/universal/extract-request-metadata';
import { createDocumentAuditLogData } from '@documenso/lib/utils/document-audit-logs';
import { prisma } from '@documenso/prisma';
import type { DocumentData, Envelope, EnvelopeItem } from '@prisma/client';
import {
  DocumentSigningOrder,
  DocumentStatus,
  EnvelopeType,
  RecipientRole,
  SendStatus,
  SigningStatus,
  WebhookTriggerEvents,
} from '@prisma/client';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { jobs } from '../../jobs/client';
import { extractDerivedDocumentEmailSettings } from '../../types/document-email';
import { mapEnvelopeToWebhookDocumentPayload, ZWebhookDocumentSchema } from '../../types/webhook-payload';
import { getFileServerSide } from '../../universal/upload/get-file.server';
import { putNormalizedPdfFileServerSide } from '../../universal/upload/put-file.server';
import { isDocumentCompleted } from '../../utils/document';
import { extractDocumentAuthMethods } from '../../utils/document-auth';
import { type EnvelopeIdOptions, mapSecondaryIdToDocumentId } from '../../utils/envelope';
import { getInvalidFieldGroupConfigurations } from '../../utils/field-groups';
import { getFieldsOutsideDocument } from '../../utils/field-placements';
import { getRecipientsWithMissingFields, isRecipientEmailValidForSending } from '../../utils/recipients';
import { getEnvelopeWhereInput } from '../envelope/get-envelope-by-id';
import { extractFieldAutoInsertValues } from '../field/extract-field-auto-insert-values';
import { getEnvelopeItemPageCounts } from '../pdf/get-envelope-item-page-counts';
import { insertFormValuesInPdf } from '../pdf/insert-form-values-in-pdf';
import { triggerWebhook } from '../webhooks/trigger/trigger-webhook';

export type SendDocumentOptions = {
  id: EnvelopeIdOptions;
  userId: number;
  teamId: number;
  sendEmail?: boolean;
  requestMetadata: ApiRequestMetadata;
};

export const sendDocument = async ({ id, userId, teamId, sendEmail, requestMetadata }: SendDocumentOptions) => {
  const { envelopeWhereInput } = await getEnvelopeWhereInput({
    id,
    type: EnvelopeType.DOCUMENT,
    userId,
    teamId,
  });

  const envelope = await prisma.envelope.findFirst({
    where: envelopeWhereInput,
    include: {
      recipients: {
        orderBy: [{ signingOrder: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      },
      fields: {
        include: {
          fieldGroup: true,
        },
      },
      documentMeta: true,
      envelopeItems: {
        select: {
          id: true,
          documentData: {
            select: {
              type: true,
              id: true,
              data: true,
              initialData: true,
            },
          },
        },
      },
    },
  });

  if (!envelope) {
    throw new Error('Document not found');
  }

  if (envelope.recipients.length === 0) {
    throw new Error('Document has no recipients');
  }

  if (isDocumentCompleted(envelope.status)) {
    throw new Error('Can not send completed document');
  }

  const legacyDocumentId = mapSecondaryIdToDocumentId(envelope.secondaryId);

  const signingOrder = envelope.documentMeta?.signingOrder || DocumentSigningOrder.PARALLEL;

  let recipientsToNotify = envelope.recipients;

  if (signingOrder === DocumentSigningOrder.SEQUENTIAL) {
    // Get the currently active recipient.
    recipientsToNotify = envelope.recipients
      .filter((r) => r.signingStatus === SigningStatus.NOT_SIGNED && r.role !== RecipientRole.CC)
      .slice(0, 1);

    // Secondary filter so we aren't resending if the current active recipient has already
    // received the envelope.
    recipientsToNotify.filter((r) => r.sendStatus !== SendStatus.SENT);
  }

  if (envelope.envelopeItems.length === 0) {
    throw new Error('Missing envelope items');
  }

  const envelopeItemPageCounts = await getEnvelopeItemPageCounts(envelope.envelopeItems);
  const fieldsOutsideDocument = getFieldsOutsideDocument(
    envelope.fields,
    envelope.envelopeItems.map((envelopeItem) => ({
      id: envelopeItem.id,
      pageCount: envelopeItemPageCounts.get(envelopeItem.id),
    })),
  );

  if (fieldsOutsideDocument.length > 0) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: `The document has ${fieldsOutsideDocument.length} field(s) outside the available PDF pages.`,
      userMessage: 'Move or remove all fields that are outside the document before sending it.',
    });
  }

  const invalidFieldGroupConfigurations = getInvalidFieldGroupConfigurations(envelope.fields);

  if (invalidFieldGroupConfigurations.length > 0) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: `The following validation groups have invalid rules: ${invalidFieldGroupConfigurations
        .map((group) => group.name)
        .join(', ')}`,
      userMessage: 'Fix the validation rules for all groups before sending this document.',
    });
  }

  if (envelope.formValues) {
    await Promise.all(
      envelope.envelopeItems.map(async (envelopeItem) => {
        await injectFormValuesIntoDocument(envelope, envelopeItem);
      }),
    );
  }

  // Validate that recipients with auth requirements have a valid email.
  envelope.recipients.forEach((recipient) => {
    const auth = extractDocumentAuthMethods({
      documentAuth: envelope.authOptions,
      recipientAuth: recipient.authOptions,
    });

    if (
      recipient.role !== RecipientRole.CC &&
      (auth.recipientAccessAuthRequired || auth.recipientActionAuthRequired) &&
      !isRecipientEmailValidForSending(recipient)
    ) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: `Recipient ${recipient.id} requires an email because they have auth requirements.`,
      });
    }
  });

  // Validate that recipients who require fields (e.g., signers need signature fields) have them.
  const recipientsWithMissingFields = getRecipientsWithMissingFields(envelope.recipients, envelope.fields);

  if (recipientsWithMissingFields.length > 0) {
    const missingRecipientDescriptions = recipientsWithMissingFields
      .map((r) => (r.name ? `${r.name} (${r.email}, id: ${r.id})` : `${r.email} (id: ${r.id})`))
      .join(', ');

    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: `The following recipients are missing required fields: ${missingRecipientDescriptions}. Signers must have at least one signature field.`,
    });
  }

  const allRecipientsHaveNoActionToTake = envelope.recipients.every(
    (recipient) => recipient.role === RecipientRole.CC || recipient.signingStatus === SigningStatus.SIGNED,
  );

  if (allRecipientsHaveNoActionToTake) {
    await jobs.triggerJob({
      name: 'internal.seal-document',
      payload: {
        documentId: legacyDocumentId,
        requestMetadata: requestMetadata?.requestMetadata,
      },
    });

    // Keep the return type the same for the `sendDocument` method
    return await prisma.envelope.findFirstOrThrow({
      where: {
        id: envelope.id,
      },
      include: {
        documentMeta: true,
        recipients: true,
      },
    });
  }

  const fieldsToAutoInsert: { fieldId: number; customText: string }[] = [];

  // Validate and autoinsert fields for V2 envelopes.
  if (envelope.internalVersion === 2) {
    for (const unknownField of envelope.fields) {
      const recipient = envelope.recipients.find((r) => r.id === unknownField.recipientId);

      if (!recipient) {
        throw new AppError(AppErrorCode.NOT_FOUND, {
          message: 'Recipient not found',
        });
      }

      const fieldToAutoInsert = extractFieldAutoInsertValues(unknownField, recipient);

      // Only auto-insert fields if the recipient has not been sent the document yet.
      if (fieldToAutoInsert && recipient.sendStatus !== SendStatus.SENT) {
        fieldsToAutoInsert.push(fieldToAutoInsert);
      }
    }
  }

  const updatedEnvelope = await prisma.$transaction(async (tx) => {
    if (envelope.status === DocumentStatus.DRAFT) {
      await tx.documentAuditLog.create({
        data: createDocumentAuditLogData({
          type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_SENT,
          envelopeId: envelope.id,
          metadata: requestMetadata,
          data: {},
        }),
      });
    }

    if (envelope.internalVersion === 2) {
      const autoInsertedFields = await Promise.all(
        fieldsToAutoInsert.map(async (field) => {
          // Warning: Only auto-insert fields if the recipient has not been sent the document yet.
          return await tx.field.update({
            where: {
              id: field.fieldId,
            },
            data: {
              customText: field.customText,
              inserted: true,
            },
          });
        }),
      );

      await tx.documentAuditLog.create({
        data: createDocumentAuditLogData({
          type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_FIELDS_AUTO_INSERTED,
          envelopeId: envelope.id,
          data: {
            fields: autoInsertedFields.map((field) => ({
              fieldId: field.id,
              fieldType: field.type,
              recipientId: field.recipientId,
            })),
          },
          // Don't put metadata or user here since it's a system event.
        }),
      });
    }

    const expiresAt = resolveExpiresAt(envelope.documentMeta?.envelopeExpirationPeriod ?? null);

    // Set expiresAt on each recipient that hasn't already signed/rejected.
    // Exclude CC recipients since they don't sign and shouldn't be subject to expiry.
    if (expiresAt) {
      await tx.recipient.updateMany({
        where: {
          envelopeId: envelope.id,
          signingStatus: {
            notIn: [SigningStatus.SIGNED, SigningStatus.REJECTED],
          },
          role: {
            not: RecipientRole.CC,
          },
        },
        data: {
          expiresAt,
          expirationNotifiedAt: null,
        },
      });
    }

    return await tx.envelope.update({
      where: {
        id: envelope.id,
      },
      data: {
        status: DocumentStatus.PENDING,
      },
      include: {
        documentMeta: true,
        recipients: true,
      },
    });
  });

  const isRecipientSigningRequestEmailEnabled = extractDerivedDocumentEmailSettings(
    envelope.documentMeta,
  ).recipientSigningRequest;

  // Only send email if one of the following is true:
  // - It is explicitly set
  // - The email is enabled for signing requests AND sendEmail is undefined
  if (sendEmail || (isRecipientSigningRequestEmailEnabled && sendEmail === undefined)) {
    await Promise.all(
      recipientsToNotify.map(async (recipient) => {
        if (recipient.sendStatus === SendStatus.SENT || recipient.role === RecipientRole.CC) {
          return;
        }

        await jobs.triggerJob({
          name: 'send.signing.requested.email',
          payload: {
            userId,
            documentId: legacyDocumentId,
            recipientId: recipient.id,
            requestMetadata: requestMetadata?.requestMetadata,
          },
        });
      }),
    );
  }

  await triggerWebhook({
    event: WebhookTriggerEvents.DOCUMENT_SENT,
    data: ZWebhookDocumentSchema.parse(mapEnvelopeToWebhookDocumentPayload(updatedEnvelope)),
    userId,
    teamId,
  });

  return updatedEnvelope;
};

const injectFormValuesIntoDocument = async (
  envelope: Envelope,
  envelopeItem: Pick<EnvelopeItem, 'id'> & { documentData: DocumentData },
) => {
  const file = await getFileServerSide(envelopeItem.documentData);

  const prefilled = await insertFormValuesInPdf({
    pdf: Buffer.from(file),
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    formValues: envelope.formValues as Record<string, string | number | boolean>,
  });

  let fileName = envelope.title;

  if (!envelope.title.endsWith('.pdf')) {
    fileName = `${envelope.title}.pdf`;
  }

  const newDocumentData = await putNormalizedPdfFileServerSide({
    name: fileName,
    type: 'application/pdf',
    arrayBuffer: async () => Promise.resolve(prefilled),
  });

  await prisma.envelopeItem.update({
    where: {
      id: envelopeItem.id,
    },
    data: {
      documentDataId: newDocumentData.id,
    },
  });
};
