import { prisma } from '@documenso/prisma';
import { DocumentStatus, FieldType, RecipientRole, SigningStatus } from '@prisma/client';
import { isBase64Image, type SignatureFontFamily } from '../../constants/signatures';
import { AppError, AppErrorCode } from '../../errors/app-error';
import { DOCUMENT_AUDIT_LOG_TYPE } from '../../types/document-audit-logs';
import type { TRecipientActionAuth } from '../../types/document-auth';
import { getConditionalFieldVisibility } from '../../universal/conditional-field-visibility';
import type { RequestMetadata } from '../../universal/extract-request-metadata';
import { createDocumentAuditLogData } from '../../utils/document-audit-logs';
import { assertRecipientNotExpired } from '../../utils/recipients';
import { validateFieldAuth } from '../document/validate-field-auth';
import { assertEnvelopeNotCorrecting } from '../envelope/assert-envelope-not-correcting';

type ReplaceFilledSignaturesOptions = {
  token: string;
  value: string;
  signatureFont?: SignatureFontFamily | null;
  authOptions?: TRecipientActionAuth;
  userId?: number;
  requestMetadata?: RequestMetadata;
};

export const replaceFilledSignatures = async ({
  token,
  value,
  signatureFont,
  authOptions,
  userId,
  requestMetadata,
}: ReplaceFilledSignaturesOptions) => {
  const foundRecipient = await prisma.recipient.findFirst({ where: { token } });

  if (!foundRecipient) {
    throw new AppError(AppErrorCode.NOT_FOUND);
  }

  return await prisma.$transaction(async (tx) => {
    // Serialize against completion; recheck status after acquiring the same rows.
    await tx.$queryRaw`SELECT "id" FROM "Recipient" WHERE "id" = ${foundRecipient.id} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "Envelope" WHERE "id" = ${foundRecipient.envelopeId} FOR UPDATE`;
    const recipient = await tx.recipient.findUniqueOrThrow({
      where: { id: foundRecipient.id },
      include: { envelope: { include: { documentMeta: true } } },
    });

    const { envelope } = recipient;

    if (
      envelope.deletedAt ||
      envelope.status !== DocumentStatus.PENDING ||
      recipient.signingStatus === SigningStatus.SIGNED ||
      (recipient.role !== RecipientRole.SIGNER && recipient.role !== RecipientRole.APPROVER)
    ) {
      throw new AppError(AppErrorCode.INVALID_REQUEST);
    }

    assertEnvelopeNotCorrecting(envelope);
    assertRecipientNotExpired(recipient);

    if (!value.trim()) {
      throw new AppError(AppErrorCode.INVALID_REQUEST);
    }

    const isBase64 = isBase64Image(value);

    if (!isBase64 && envelope.documentMeta?.typedSignatureEnabled === false) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, { message: 'Typed signatures are not allowed' });
    }

    const allFields = await tx.field.findMany({
      where: { envelopeId: envelope.id },
      include: { conditionalChildRule: true, fieldGroup: true },
    });
    const visibility = getConditionalFieldVisibility(
      allFields.map((field) => ({ ...field, envelopeInternalVersion: envelope.internalVersion })),
    );
    const fields = allFields.filter(
      (field) =>
        field.recipientId === recipient.id &&
        (field.type === FieldType.SIGNATURE || field.type === FieldType.FREE_SIGNATURE) &&
        field.inserted &&
        !field.fieldMeta?.readOnly &&
        !field.fieldGroup?.readOnly &&
        (visibility.get(field.id) ?? true),
    );

    if (fields.length === 0) {
      return [];
    }

    // Authenticate this replacement once. Passkey proofs cannot be replayed per field.
    const actionAuth = await validateFieldAuth({
      recipient,
      field: { ...fields[0], type: FieldType.SIGNATURE },
      documentAuthOptions: envelope.authOptions,
      authOptions,
      userId,
    });

    const updated = [];

    for (const field of fields) {
      if (field.type !== FieldType.SIGNATURE && field.type !== FieldType.FREE_SIGNATURE) {
        continue;
      }

      const signatureData = {
        signatureImageAsBase64: isBase64 ? value : null,
        typedSignature: isBase64 ? null : value,
        typedSignatureFont: isBase64 ? null : (signatureFont ?? null),
      };
      const signature = await tx.signature.upsert({
        where: { fieldId: field.id },
        create: { ...signatureData, fieldId: field.id, recipientId: recipient.id },
        update: signatureData,
      });

      await tx.documentAuditLog.create({
        data: createDocumentAuditLogData({
          type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_FIELD_INSERTED,
          envelopeId: envelope.id,
          user: { email: recipient.email, name: recipient.name },
          requestMetadata,
          data: {
            recipientEmail: recipient.email,
            recipientId: recipient.id,
            recipientName: recipient.name,
            recipientRole: recipient.role,
            fieldId: field.secondaryId,
            field: { type: field.type, data: value },
            fieldSecurity: actionAuth ? { type: actionAuth } : undefined,
          },
        }),
      });

      updated.push({ id: field.id, signature });
    }

    return updated;
  });
};
