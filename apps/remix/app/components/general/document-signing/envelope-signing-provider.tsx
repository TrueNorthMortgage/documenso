import { DEFAULT_DOCUMENT_DATE_FORMAT } from '@documenso/lib/constants/date-formats';
import { isBase64Image, isSignatureFontFamily, type SignatureFontFamily } from '@documenso/lib/constants/signatures';
import { DEFAULT_DOCUMENT_TIME_ZONE } from '@documenso/lib/constants/time-zones';
import { DO_NOT_INVALIDATE_QUERY_ON_MUTATION } from '@documenso/lib/constants/trpc';
import type { EnvelopeForSigningResponse } from '@documenso/lib/server-only/envelope/get-envelope-for-recipient-signing';
import type { TRecipientActionAuth } from '@documenso/lib/types/document-auth';
import { getConditionalFieldVisibility } from '@documenso/lib/universal/conditional-field-visibility';
import { getFieldsRequiringValidation } from '@documenso/lib/utils/advanced-fields-helpers';
import { isDateFieldAutoFillEnabled } from '@documenso/lib/utils/date-fields';
import { extractFieldInsertionValues } from '@documenso/lib/utils/envelope-signing';
import { createInitialsSession } from '@documenso/lib/utils/initials-session';
import { getFilledIdentityFieldsToUpdate } from '@documenso/lib/utils/signing-identity';
import { trpc } from '@documenso/trpc/react';
import type { TSignEnvelopeFieldValue } from '@documenso/trpc/server/envelope-router/sign-envelope-field.types';
import { EnvelopeType, type Field, FieldType, type Recipient, RecipientRole, SigningStatus } from '@prisma/client';
import { DateTime } from 'luxon';
import { createContext, useContext, useMemo, useState } from 'react';
import { prop, sortBy } from 'remeda';
import { SignFieldInitialsDialog } from '~/components/dialogs/sign-field-initials-dialog';

export type EnvelopeSigningContextValue = {
  isDirectTemplate: boolean;

  isUpdatingIdentity: boolean;
  updateSignature: (
    _value: string,
    _font: SignatureFontFamily | null,
    _authOptions?: TRecipientActionAuth,
  ) => Promise<void>;
  updateFullName: (_name: string) => Promise<void>;
  updateInitials: (_recipientId: number, _initials: string) => Promise<void>;
  initialsByRecipient: Record<number, string>;
  setInitials: (_recipientId: number, _initials: string) => void;
  requestInitials: (_recipientId: number, _fullName: string) => Promise<string | null>;

  fullName: string;
  setFullName: (_value: string) => void;
  email: string;
  setEmail: (_value: string) => void;
  signature: string | null;
  setSignature: (_value: string | null) => void;
  signatureFont: SignatureFontFamily | null;
  setSignatureFont: (_value: SignatureFontFamily | null) => void;

  showPendingFieldTooltip: boolean;
  setShowPendingFieldTooltip: (_value: boolean) => void;

  inlineFieldId: number | null;
  setInlineFieldId: (_value: number | null) => void;

  envelopeData: EnvelopeForSigningResponse;
  envelope: EnvelopeForSigningResponse['envelope'];

  recipient: EnvelopeForSigningResponse['recipient'];
  recipientFieldsRemaining: Field[];
  recipientFields: Field[];
  requiredRecipientFields: Field[];
  selectedAssistantRecipientFields: Field[];
  nextRecipient: EnvelopeForSigningResponse['envelope']['recipients'][number] | null;
  otherRecipientCompletedFields: (Field & {
    recipient: Pick<Recipient, 'name' | 'email' | 'signingStatus' | 'role'>;
  })[];
  assistantRecipients: EnvelopeForSigningResponse['envelope']['recipients'];
  assistantFields: Field[];
  setSelectedAssistantRecipientId: (_value: number | null) => void;
  selectedAssistantRecipient: EnvelopeForSigningResponse['envelope']['recipients'][number] | null;

  signField: (
    _fieldId: number,
    _value: TSignEnvelopeFieldValue,
    authOptions?: TRecipientActionAuth,
  ) => Promise<Pick<Field, 'id' | 'inserted'>>;
};

const EnvelopeSigningContext = createContext<EnvelopeSigningContextValue | null>(null);

export const useEnvelopeSigningContext = () => {
  return useContext(EnvelopeSigningContext);
};

export const useRequiredEnvelopeSigningContext = () => {
  const context = useEnvelopeSigningContext();

  if (!context) {
    throw new Error('Signing context is required');
  }

  return context;
};

export interface EnvelopeSigningProviderProps {
  fullName?: string | null;
  email?: string | null;
  signature?: string | null;
  envelopeData: EnvelopeForSigningResponse;
  children: React.ReactNode;
}

/**
 * Inject prefilled date fields for the current recipient.
 *
 * The dates are filled in correctly when the recipient "completes" the document.
 */
const prefillDateFields = (data: EnvelopeForSigningResponse): EnvelopeForSigningResponse => {
  const { timezone, dateFormat } = data.envelope.documentMeta;

  const formattedDate = DateTime.now()
    .setZone(timezone ?? DEFAULT_DOCUMENT_TIME_ZONE)
    .toFormat(dateFormat ?? DEFAULT_DOCUMENT_DATE_FORMAT);

  const fieldVisibility = getConditionalFieldVisibility(
    data.envelope.recipients.flatMap((recipient) =>
      recipient.fields.map((field) => ({
        ...field,
        envelopeInternalVersion: data.envelope.internalVersion,
      })),
    ),
  );

  const prefillField = <
    T extends { id: number; type: FieldType; inserted: boolean; customText: string; fieldMeta: unknown },
  >(
    field: T,
  ): T => {
    if (
      field.type !== FieldType.DATE ||
      !isDateFieldAutoFillEnabled(field.fieldMeta) ||
      field.inserted ||
      fieldVisibility.get(field.id) === false
    ) {
      return field;
    }

    return {
      ...field,
      customText: formattedDate,
      inserted: true,
      fieldMeta: {
        ...(typeof field.fieldMeta === 'object' ? field.fieldMeta : {}),
        readOnly: true,
      },
    };
  };

  return {
    ...data,
    envelope: {
      ...data.envelope,
      recipients: data.envelope.recipients.map((recipient) => ({
        ...recipient,
        fields: recipient.fields.map(prefillField),
      })),
    },
    recipient: {
      ...data.recipient,
      fields: data.recipient.fields.map(prefillField),
    },
  };
};

export const EnvelopeSigningProvider = ({
  fullName: initialFullName,
  email: initialEmail,
  signature: initialSignature,
  envelopeData: initialEnvelopeData,
  children,
}: EnvelopeSigningProviderProps) => {
  const [envelopeData, setEnvelopeData] = useState(() => prefillDateFields(initialEnvelopeData));

  const { envelope, recipient } = envelopeData;

  const [isUpdatingIdentity, setIsUpdatingIdentity] = useState(false);
  const [initialsByRecipient, setInitialsByRecipient] = useState<Record<number, string>>({});
  const [initialsSession] = useState(() =>
    createInitialsSession(
      (initials) => SignFieldInitialsDialog.call({ initials }),
      (recipientId, initials) => setInitialsByRecipient((previous) => ({ ...previous, [recipientId]: initials })),
    ),
  );

  const [fullName, setFullName] = useState(initialFullName || '');
  const [email, setEmail] = useState(initialEmail || '');
  const [signatureFont, setSignatureFont] = useState<SignatureFontFamily | null>(() => {
    const font = envelopeData.recipientSignature?.typedSignatureFont;
    return isSignatureFontFamily(font) ? font : null;
  });

  const [showPendingFieldTooltip, setShowPendingFieldTooltip] = useState(false);
  const [inlineFieldId, setInlineFieldId] = useState<number | null>(null);

  const isDirectTemplate = envelope.type === EnvelopeType.TEMPLATE;

  const fieldVisibility = useMemo(
    () =>
      getConditionalFieldVisibility(
        envelopeData.envelope.recipients.flatMap((item) =>
          item.fields.map((field) => ({
            ...field,
            envelopeInternalVersion: envelope.internalVersion,
          })),
        ),
      ),
    [envelopeData.envelope.recipients, envelope.internalVersion],
  );

  const isFieldVisible = (field: Field) => fieldVisibility.get(field.id) ?? true;

  const { mutateAsync: signEnvelopeField } = trpc.envelope.field.sign.useMutation({
    ...DO_NOT_INVALIDATE_QUERY_ON_MUTATION,
    onSuccess: (data) => {
      const clearedFieldIds = new Set(data.clearedFieldIds);
      const autoInsertedFields = new Map(data.autoInsertedFields.map((field) => [field.id, field]));
      const updateField = (field: Field) => {
        const updatedField =
          field.id === data.signedField.id
            ? { ...field, ...data.signedField }
            : autoInsertedFields.has(field.id)
              ? { ...field, ...autoInsertedFields.get(field.id) }
              : field;

        return clearedFieldIds.has(field.id)
          ? { ...updatedField, customText: '', inserted: false, signature: null }
          : updatedField;
      };

      setEnvelopeData((prev) => ({
        ...prev,
        envelope: {
          ...prev.envelope,
          recipients: prev.envelope.recipients.map((recipient) => ({
            ...recipient,
            fields: recipient.fields.map(updateField),
          })),
        },
        recipient: {
          ...prev.recipient,
          fields: prev.recipient.fields.map(updateField),
        },
      }));
    },
  });

  // Ensure the user signature doesn't show up if it's not allowed.
  const [signature, setSignature] = useState(
    (() => {
      const sig = initialSignature || '';
      const isBase64 = isBase64Image(sig);

      if (
        !sig &&
        (envelope.documentMeta.uploadSignatureEnabled || envelope.documentMeta.drawSignatureEnabled) &&
        envelopeData.recipientSignature?.signatureImageAsBase64
      ) {
        return envelopeData.recipientSignature.signatureImageAsBase64;
      }

      if (!sig && envelope.documentMeta.typedSignatureEnabled && envelopeData.recipientSignature?.typedSignature) {
        return envelopeData.recipientSignature.typedSignature;
      }

      if (isBase64 && (envelope.documentMeta.uploadSignatureEnabled || envelope.documentMeta.drawSignatureEnabled)) {
        return sig;
      }

      if (!isBase64 && envelope.documentMeta.typedSignatureEnabled) {
        return sig;
      }

      return null;
    })(),
  );

  /**
   * The fields that are still required to be signed by the actual recipient.
   */
  const recipientFieldsRemaining = useMemo(() => {
    const requiredFields = getFieldsRequiringValidation(envelopeData.recipient.fields.filter(isFieldVisible))
      .filter((field) => !field.inserted)
      .map((field) => {
        const envelopeItem = envelope.envelopeItems.find((item) => item.id === field.envelopeItemId);

        if (!envelopeItem) {
          throw new Error('Missing envelope item');
        }

        return {
          ...field,
          envelopeItemOrder: envelopeItem.order,
        };
      });

    return sortBy(
      requiredFields,
      [prop('envelopeItemOrder'), 'asc'],
      [prop('page'), 'asc'],
      [prop('positionY'), 'asc'],
    );
  }, [envelopeData.recipient.fields, fieldVisibility]);

  /**
   * All the required fields for the actual recipient.
   */
  const requiredRecipientFields = useMemo(() => {
    return getFieldsRequiringValidation(envelopeData.recipient.fields.filter(isFieldVisible));
  }, [envelopeData.recipient.fields, fieldVisibility]);

  /**
   * All the fields for the actual recipient.
   */
  const recipientFields = useMemo(() => {
    return envelopeData.recipient.fields.filter(isFieldVisible);
  }, [envelopeData.recipient.fields, fieldVisibility]);

  /**
   * Assistant recipients are those that have a signing order after the assistant.
   */
  const assistantRecipients =
    recipient.role === RecipientRole.ASSISTANT
      ? envelope.recipients.filter((r) => (r.signingOrder ?? 0) > (recipient.signingOrder ?? 0))
      : [];

  /**
   * Assistant fields are those fulfill all of the following:
   * - From recipients that have not signed
   * - After the assistant signing order
   * - Are not signature fields
   */
  const assistantFields =
    recipient.role === RecipientRole.ASSISTANT
      ? assistantRecipients
          .filter((r) => r.signingStatus !== SigningStatus.SIGNED)
          .flatMap((r) => r.fields.filter((field) => field.type !== FieldType.SIGNATURE && isFieldVisible(field)))
      : [];

  /**
   * The recipient that the assistant has currently selected to sign on behalf of.
   */
  const [selectedAssistantRecipientId, setSelectedAssistantRecipientId] = useState<number | null>(
    assistantRecipients[0]?.id || null,
  );

  const selectedAssistantRecipient = useMemo(() => {
    return envelope.recipients.find((r) => r.id === selectedAssistantRecipientId) || null;
  }, [envelope.recipients, selectedAssistantRecipientId]);

  const selectedAssistantRecipientFields = useMemo(() => {
    return assistantFields.filter((field) => field.recipientId === selectedAssistantRecipient?.id);
  }, [recipientFields, selectedAssistantRecipient]);

  /**
   * Fields that have been completed by other recipients.
   */
  const otherRecipientCompletedFields = envelope.recipients
    .filter(({ signingStatus }) => signingStatus === SigningStatus.SIGNED)
    .flatMap((recipient) =>
      recipient.fields.map((field) => ({
        ...field,
        recipient: {
          name: recipient.name,
          email: recipient.email,
          signingStatus: recipient.signingStatus,
          role: recipient.role,
        },
      })),
    )
    .filter((field) => field.inserted && isFieldVisible(field));

  const nextRecipient = useMemo(() => {
    if (!envelope.documentMeta.signingOrder || envelope.documentMeta.signingOrder !== 'SEQUENTIAL') {
      return null;
    }

    const sortedRecipients = envelope.recipients.sort((a, b) => {
      // Sort by signingOrder first (nulls last), then by id
      if (a.signingOrder === null && b.signingOrder === null) {
        return a.id - b.id;
      }
      if (a.signingOrder === null) {
        return 1;
      }
      if (b.signingOrder === null) {
        return -1;
      }
      if (a.signingOrder === b.signingOrder) {
        return a.id - b.id;
      }
      return a.signingOrder - b.signingOrder;
    });

    const currentIndex = sortedRecipients.findIndex((r) => r.id === recipient.id);

    return currentIndex !== -1 && currentIndex < sortedRecipients.length - 1
      ? sortedRecipients[currentIndex + 1]
      : null;
  }, [envelope.documentMeta?.signingOrder, envelope.recipients, recipient.id]);

  const signField = async (
    fieldId: number,
    fieldValue: TSignEnvelopeFieldValue,
    authOptions?: TRecipientActionAuth,
  ) => {
    // Set the field locally for direct templates.
    if (isDirectTemplate) {
      const signedField = handleDirectTemplateFieldInsertion(fieldId, fieldValue);

      return signedField;
    }

    const { signedField } = await signEnvelopeField({
      token: envelopeData.recipient.token,
      fieldId,
      fieldValue,
      authOptions,
    });

    return signedField;
  };

  const { mutateAsync: replaceFilledSignatures } = trpc.envelope.field.replaceFilledSignatures.useMutation(
    DO_NOT_INVALIDATE_QUERY_ON_MUTATION,
  );

  const updateSignature = async (
    value: string,
    font: SignatureFontFamily | null,
    authOptions?: TRecipientActionAuth,
  ) => {
    if (isUpdatingIdentity) {
      return;
    }

    const fields = recipientFields.filter(
      (field) => field.type === FieldType.SIGNATURE && field.inserted && !field.fieldMeta?.readOnly,
    );
    setIsUpdatingIdentity(true);

    try {
      if (fields.length > 0) {
        if (isDirectTemplate) {
          for (const field of fields) {
            handleDirectTemplateFieldInsertion(field.id, {
              type: FieldType.SIGNATURE,
              value,
              signatureFont: font ?? undefined,
            });
          }
        } else {
          const result = await replaceFilledSignatures({
            token: recipient.token,
            value,
            signatureFont: font,
            authOptions,
          });
          const signatures = new Map(result.fields.map((field) => [field.id, field.signature]));
          const updateField = <T extends Field>(field: T) => {
            const signature = signatures.get(field.id);
            return signature ? { ...field, signature } : field;
          };
          setEnvelopeData((previous) => ({
            ...previous,
            recipient: { ...previous.recipient, fields: previous.recipient.fields.map(updateField) },
            envelope: {
              ...previous.envelope,
              recipients: previous.envelope.recipients.map((candidate) => ({
                ...candidate,
                fields: candidate.fields.map(updateField),
              })),
            },
          }));
        }
      }

      setSignature(value);
      setSignatureFont(font);
    } finally {
      setIsUpdatingIdentity(false);
    }
  };

  const updateIdentityFields = async (
    recipientId: number,
    type: typeof FieldType.NAME | typeof FieldType.INITIALS,
    value: string,
  ) => {
    const activeRecipientId =
      recipient.role === RecipientRole.ASSISTANT ? selectedAssistantRecipient?.id : recipient.id;

    if (recipientId !== activeRecipientId || !value.trim() || isUpdatingIdentity) {
      return;
    }

    const fields = envelope.recipients.find((candidate) => candidate.id === recipientId)?.fields ?? [];
    const fieldsToUpdate = getFilledIdentityFieldsToUpdate(fields.filter(isFieldVisible), recipientId, type, value);

    setIsUpdatingIdentity(true);

    try {
      for (const field of fieldsToUpdate) {
        await signField(field.id, { type, value });
      }

      if (type === FieldType.INITIALS) {
        initialsSession.setInitials(recipientId, value);
      } else {
        setFullName(value);
      }
    } finally {
      setIsUpdatingIdentity(false);
    }
  };

  const updateInitials = (recipientId: number, initials: string) =>
    updateIdentityFields(recipientId, FieldType.INITIALS, initials);

  const updateFullName = (name: string) => updateIdentityFields(recipient.id, FieldType.NAME, name);

  const handleDirectTemplateFieldInsertion = (fieldId: number, fieldValue: TSignEnvelopeFieldValue) => {
    const foundField = recipient.fields.find((field) => field.id === fieldId);

    if (!foundField) {
      throw new Error('Not possible');
    }

    const insertionValues = extractFieldInsertionValues({
      fieldValue,
      field: foundField,
      documentMeta: envelope.documentMeta,
    });

    const updatedField = {
      ...foundField,
      ...insertionValues,
    };

    if (fieldValue.type === FieldType.SIGNATURE) {
      const isBase64 = isBase64Image(fieldValue.value || '');

      updatedField.signature = fieldValue.value
        ? {
            signatureImageAsBase64: isBase64 ? fieldValue.value : null,
            typedSignature: isBase64 ? null : fieldValue.value,
            typedSignatureFont: isBase64 ? null : (fieldValue.signatureFont ?? null),
            recipientId: recipient.id,
            created: new Date(),
            // Dummy IDs.
            id: 0,
            fieldId: 0,
          }
        : null;
    }

    setEnvelopeData((prev) => ({
      ...prev,
      envelope: {
        ...prev.envelope,
        recipients: prev.envelope.recipients.map((r) =>
          r.id === recipient.id
            ? {
                ...r,
                fields: r.fields.map((field) => (field.id === fieldId ? updatedField : field)),
              }
            : r,
        ),
      },
      recipient: {
        ...prev.recipient,
        fields: prev.recipient.fields.map((field) => (field.id === fieldId ? updatedField : field)),
      },
    }));

    return updatedField;
  };

  return (
    <EnvelopeSigningContext.Provider
      value={{
        isDirectTemplate,
        isUpdatingIdentity,
        updateInitials,
        updateFullName,
        updateSignature,
        initialsByRecipient,
        requestInitials: initialsSession.requestInitials,
        setInitials: initialsSession.setInitials,
        fullName,
        setFullName,
        email,
        setEmail,
        signature,
        setSignature,
        signatureFont,
        setSignatureFont,
        envelopeData,
        envelope,

        showPendingFieldTooltip,
        setShowPendingFieldTooltip,
        inlineFieldId,
        setInlineFieldId,

        recipient,
        recipientFieldsRemaining,
        recipientFields,
        requiredRecipientFields,
        nextRecipient,

        otherRecipientCompletedFields,
        assistantRecipients,
        assistantFields,
        setSelectedAssistantRecipientId,
        selectedAssistantRecipient,
        selectedAssistantRecipientFields,

        signField,
      }}
    >
      {children}
    </EnvelopeSigningContext.Provider>
  );
};

EnvelopeSigningProvider.displayName = 'EnvelopeSigningProvider';
