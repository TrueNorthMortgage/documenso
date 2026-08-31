import { usePageRenderer } from '@documenso/lib/client-only/hooks/use-page-renderer';
import {
  type PageRenderData,
  useCurrentEnvelopeRender,
} from '@documenso/lib/client-only/providers/envelope-render-provider';
import { useOptionalSession } from '@documenso/lib/client-only/providers/session';
import { DIRECT_TEMPLATE_RECIPIENT_EMAIL } from '@documenso/lib/constants/direct-templates';
import { PDF_VIEWER_CONTENT_SELECTOR } from '@documenso/lib/constants/pdf-viewer';
import { isBase64Image } from '@documenso/lib/constants/signatures';
import type { TRecipientActionAuth } from '@documenso/lib/types/document-auth';
import type { TEnvelope } from '@documenso/lib/types/envelope';
import type { TFieldCheckbox, TFieldDate, TFieldNumber, TFieldText } from '@documenso/lib/types/field';
import { ZFullFieldSchema } from '@documenso/lib/types/field';
import { createSpinner } from '@documenso/lib/universal/field-renderer/field-generic-items';
import { renderField } from '@documenso/lib/universal/field-renderer/render-field';
import {
  canInsertFieldIntoValidationGroup,
  isFieldUnsignedAndRequired,
} from '@documenso/lib/utils/advanced-fields-helpers';
import type { TFieldWithGroup } from '@documenso/lib/utils/field-groups';
import { getClientSideFieldTranslations } from '@documenso/lib/utils/fields';
import { extractInitials } from '@documenso/lib/utils/recipient-formatter';
import type { TSignEnvelopeFieldValue } from '@documenso/trpc/server/envelope-router/sign-envelope-field.types';
import { EnvelopeRecipientFieldTooltip } from '@documenso/ui/components/document/envelope-recipient-field-tooltip';
import { EnvelopeFieldToolTip } from '@documenso/ui/components/field/envelope-field-tooltip';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { Trans, useLingui } from '@lingui/react/macro';
import { type Field, FieldType, type Recipient, RecipientRole, type Signature, SigningStatus } from '@prisma/client';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import { useEffect, useMemo, useRef } from 'react';
import { match } from 'ts-pattern';

import { useEmbedSigningContext } from '~/components/embed/embed-signing-context';
import { handleCheckboxFieldClick } from '~/utils/field-signing/checkbox-field';
import { handleDateFieldClick } from '~/utils/field-signing/date-field';
import { handleDropdownFieldClick } from '~/utils/field-signing/dropdown-field';
import { handleEmailFieldClick } from '~/utils/field-signing/email-field';
import { handleInitialsFieldClick } from '~/utils/field-signing/initial-field';
import { handleNameFieldClick } from '~/utils/field-signing/name-field';
import { handleNumberFieldClick } from '~/utils/field-signing/number-field';
import { handleSignatureFieldClick } from '~/utils/field-signing/signature-field';
import { handleTextFieldClick } from '~/utils/field-signing/text-field';

import { useRequiredDocumentSigningAuthContext } from '../document-signing/document-signing-auth-provider';
import { useRequiredEnvelopeSigningContext } from '../document-signing/envelope-signing-provider';
import { InlineFieldEditor } from './inline-field-editor';

type GenericLocalField = TEnvelope['fields'][number] & {
  recipient: Pick<Recipient, 'id' | 'name' | 'email' | 'signingStatus'>;
};

export const EnvelopeSignerPageRenderer = ({ pageData }: { pageData: PageRenderData }) => {
  const { t, i18n } = useLingui();
  const { currentEnvelopeItem, setCurrentEnvelopeItem, setRenderError } = useCurrentEnvelopeRender();
  const { sessionData } = useOptionalSession();

  const { executeActionAuthProcedure } = useRequiredDocumentSigningAuthContext();
  const { toast } = useToast();

  const {
    envelopeData,
    recipient,
    recipientFields,
    recipientFieldsRemaining,
    showPendingFieldTooltip,
    signField: signFieldInternal,
    email,
    setEmail,
    fullName,
    setFullName,
    signature,
    setSignature,
    signatureFont,
    setSignatureFont,
    selectedAssistantRecipientFields,
    selectedAssistantRecipient,
    isDirectTemplate,
    inlineFieldId,
    setInlineFieldId,
  } = useRequiredEnvelopeSigningContext();

  const { onFieldSigned, onFieldUnsigned } = useEmbedSigningContext() || {};
  const inlineFieldIdRef = useRef(inlineFieldId);

  inlineFieldIdRef.current = inlineFieldId;

  const { stage, pageLayer, konvaContainer, unscaledViewport } = usePageRenderer(
    ({ stage, pageLayer }) => createPageCanvas(stage, pageLayer),
    pageData,
  );

  const { scale, pageNumber } = pageData;

  const { envelope } = envelopeData;

  const localPageFields = useMemo(() => {
    let fieldsToRender = recipientFields;

    if (recipient.role === RecipientRole.ASSISTANT) {
      fieldsToRender = selectedAssistantRecipientFields;
    }

    return fieldsToRender
      .filter((field) => field.page === pageNumber && field.envelopeItemId === currentEnvelopeItem?.id)
      .sort((a, b) => Number(b.width) * Number(b.height) - Number(a.width) * Number(a.height));
  }, [recipientFields, selectedAssistantRecipientFields, pageNumber, currentEnvelopeItem?.id]);

  /**
   * Returns fields that have been fully signed by other recipients for this specific
   * page.
   */
  const localPageOtherRecipientFields = useMemo((): GenericLocalField[] => {
    const signedRecipients = envelope.recipients.filter(
      (recipient) => recipient.signingStatus === SigningStatus.SIGNED,
    );

    return signedRecipients.flatMap((recipient) => {
      return recipient.fields
        .filter(
          (field) =>
            field.page === pageNumber &&
            field.envelopeItemId === currentEnvelopeItem?.id &&
            (field.inserted || field.fieldMeta?.readOnly),
        )
        .map((field) => ({
          ...field,
          recipient: {
            id: recipient.id,
            name: recipient.name,
            email: recipient.email,
            signingStatus: recipient.signingStatus,
            role: recipient.role,
          },
        }));
    });
  }, [envelope.recipients, pageNumber, currentEnvelopeItem?.id]);

  const inlineEditableFields = useMemo((): (TFieldText | TFieldNumber)[] => {
    const fields = recipient.role === RecipientRole.ASSISTANT ? selectedAssistantRecipientFields : recipientFields;
    const envelopeItemOrder = new Map(envelope.envelopeItems.map((item) => [item.id, item.order]));

    return fields
      .filter(
        (field) => (field.type === FieldType.TEXT || field.type === FieldType.NUMBER) && !field.fieldMeta?.readOnly,
      )
      .map((field) => ZFullFieldSchema.parse(field))
      .filter(
        (field): field is TFieldText | TFieldNumber => field.type === FieldType.TEXT || field.type === FieldType.NUMBER,
      )
      .sort((a, b) => {
        const itemOrderDifference =
          (envelopeItemOrder.get(a.envelopeItemId) ?? 0) - (envelopeItemOrder.get(b.envelopeItemId) ?? 0);

        if (itemOrderDifference !== 0) {
          return itemOrderDifference;
        }

        if (a.page !== b.page) {
          return a.page - b.page;
        }

        if (Number(a.positionY) !== Number(b.positionY)) {
          return Number(a.positionY) - Number(b.positionY);
        }

        return Number(a.positionX) - Number(b.positionX);
      });
  }, [envelope.envelopeItems, recipient.role, recipientFields, selectedAssistantRecipientFields]);

  const localInlineField = useMemo(() => {
    if (inlineFieldId === null) {
      return null;
    }

    return inlineEditableFields.find(
      (field) =>
        field.id === inlineFieldId && field.envelopeItemId === currentEnvelopeItem?.id && field.page === pageNumber,
    );
  }, [currentEnvelopeItem?.id, inlineEditableFields, inlineFieldId, pageNumber]);

  const unsafeRenderFieldOnLayer = (unparsedField: Field & { signature?: Signature | null }) => {
    if (!pageLayer.current) {
      console.error('Layer not loaded yet');
      return;
    }

    const fieldToRender = ZFullFieldSchema.parse(unparsedField);

    const color = fieldToRender.fieldMeta?.readOnly
      ? 'readOnly'
      : showPendingFieldTooltip && isFieldUnsignedAndRequired(fieldToRender)
        ? 'orange'
        : 'green';

    const { fieldGroup } = renderField({
      scale,
      pageLayer: pageLayer.current,
      field: {
        renderId: fieldToRender.id.toString(),
        ...fieldToRender,
        width: Number(fieldToRender.width),
        height: Number(fieldToRender.height),
        positionX: Number(fieldToRender.positionX),
        positionY: Number(fieldToRender.positionY),
        signature: unparsedField.signature,
      },
      translations: getClientSideFieldTranslations(i18n),
      pageWidth: unscaledViewport.width,
      pageHeight: unscaledViewport.height,
      color,
      mode: 'sign',
    });

    const handleFieldGroupClick = (e: KonvaEventObject<Event>) => {
      const currentTarget = e.currentTarget as Konva.Group;
      const target = e.target as Konva.Shape;

      const fieldRect = fieldGroup.findOne('.field-rect');
      const fieldWidth = fieldRect ? fieldRect.width() : fieldGroup.width();
      const fieldHeight = fieldRect ? fieldRect.height() : fieldGroup.height();

      const foundField = localPageFields.find((f) => f.id === unparsedField.id);
      const foundLoadingGroup = currentTarget.findOne('.loading-spinner-group');

      if (!foundField || foundLoadingGroup || foundField.fieldMeta?.readOnly) {
        return;
      }

      let localEmail: string | null = email;
      let localFullName: string | null = fullName;
      let placeholderEmail: string | null = null;

      if (recipient.role === RecipientRole.ASSISTANT) {
        localEmail = selectedAssistantRecipient?.email || null;
        localFullName = selectedAssistantRecipient?.name || null;
      }

      // Allows us let the user set a different email than their current logged in email.
      if (isDirectTemplate) {
        placeholderEmail = sessionData?.user?.email || email || recipient.email;

        if (!placeholderEmail || placeholderEmail === DIRECT_TEMPLATE_RECIPIENT_EMAIL) {
          placeholderEmail = null;
        }
      }

      const loadingSpinnerGroup = createSpinner({
        fieldWidth,
        fieldHeight,
      });

      const parsedFoundField = ZFullFieldSchema.parse(foundField);

      match(parsedFoundField)
        /**
         * CHECKBOX FIELD.
         */
        .with({ type: FieldType.CHECKBOX }, (field) => {
          const clickedCheckboxIndex = Number(target.getAttr('internalCheckboxIndex'));

          if (Number.isNaN(clickedCheckboxIndex)) {
            return;
          }

          const activeRecipientFields =
            recipient.role === RecipientRole.ASSISTANT ? selectedAssistantRecipientFields : recipientFields;
          const groupFields = field.fieldGroupId
            ? activeRecipientFields
                .filter(
                  (candidate) => candidate.fieldGroupId === field.fieldGroupId && candidate.type === FieldType.CHECKBOX,
                )
                .map((candidate) => ZFullFieldSchema.parse(candidate))
                .filter((candidate): candidate is TFieldCheckbox => candidate.type === FieldType.CHECKBOX)
            : undefined;

          void handleCheckboxFieldClick({ field, clickedCheckboxIndex, groupFields })
            .then(async (payloads) => {
              if (payloads) {
                fieldGroup.add(loadingSpinnerGroup);

                for (const payload of payloads) {
                  await signField(payload.fieldId, payload.fieldValue);
                }
              }
            })
            .finally(() => {
              loadingSpinnerGroup.destroy();
            });
        })
        /**
         * RADIO FIELD.
         */
        .with({ type: FieldType.RADIO }, (field) => {
          const selectedRadioIndex = Number(target.getAttr('internalRadioIndex'));
          const fieldCustomText = Number(field.customText);

          if (Number.isNaN(selectedRadioIndex)) {
            return;
          }

          fieldGroup.add(loadingSpinnerGroup);

          // Uncheck the value if it's already pressed.
          const value = field.inserted && selectedRadioIndex === fieldCustomText ? null : selectedRadioIndex;

          void signField(field.id, {
            type: FieldType.RADIO,
            value,
          }).finally(() => {
            loadingSpinnerGroup.destroy();
          });
        })
        /**
         * NUMBER FIELD.
         */
        .with({ type: FieldType.NUMBER }, (field) => {
          if (window.matchMedia('(min-width: 1024px)').matches && !field.fieldMeta?.readOnly) {
            setInlineFieldId(field.id);
            return;
          }

          handleNumberFieldClick({ field, number: null })
            .then(async (payload) => {
              if (payload) {
                fieldGroup.add(loadingSpinnerGroup);
                await signField(field.id, payload);
              }
            })
            .finally(() => {
              loadingSpinnerGroup.destroy();
            });
        })
        /**
         * TEXT FIELD.
         */
        .with({ type: FieldType.TEXT }, (field) => {
          if (window.matchMedia('(min-width: 1024px)').matches && !field.fieldMeta?.readOnly) {
            setInlineFieldId(field.id);
            return;
          }

          handleTextFieldClick({ field, text: null })
            .then(async (payload) => {
              if (payload) {
                fieldGroup.add(loadingSpinnerGroup);
                await signField(field.id, payload);
              }
            })
            .finally(() => {
              loadingSpinnerGroup.destroy();
            });
        })
        /**
         * EMAIL FIELD.
         */
        .with({ type: FieldType.EMAIL }, (field) => {
          handleEmailFieldClick({ field, email: localEmail, placeholderEmail })
            .then(async (payload) => {
              if (payload) {
                fieldGroup.add(loadingSpinnerGroup);
                await signField(field.id, payload);
              }

              if (payload?.value) {
                setEmail(payload.value);
              }
            })
            .finally(() => {
              loadingSpinnerGroup.destroy();
            });
        })
        /**
         * INITIALS FIELD.
         */
        .with({ type: FieldType.INITIALS }, (field) => {
          const activeRecipientFields =
            recipient.role === RecipientRole.ASSISTANT ? selectedAssistantRecipientFields : recipientFields;
          const groupFields = field.fieldGroupId
            ? activeRecipientFields
                .filter((candidate) => candidate.fieldGroupId === field.fieldGroupId)
                .map((candidate) => ZFullFieldSchema.parse(candidate))
            : [];

          if (
            field.fieldGroup &&
            !canInsertFieldIntoValidationGroup(groupFields as TFieldWithGroup[], field.fieldGroup, field.id)
          ) {
            toast({
              title: t`Selection limit reached`,
              description: t`This initials group allows a maximum of ${field.fieldGroup.validationLength} fields.`,
              variant: 'destructive',
            });

            return;
          }

          const initials = localFullName ? extractInitials(localFullName, Number.POSITIVE_INFINITY) : null;

          handleInitialsFieldClick({ field, initials })
            .then(async (payload) => {
              if (payload) {
                fieldGroup.add(loadingSpinnerGroup);
                await signField(field.id, payload);
              }
            })
            .finally(() => {
              loadingSpinnerGroup.destroy();
            });
        })
        /**
         * NAME FIELD.
         */
        .with({ type: FieldType.NAME }, (field) => {
          handleNameFieldClick({ field, name: localFullName })
            .then(async (payload) => {
              if (payload) {
                fieldGroup.add(loadingSpinnerGroup);
                await signField(field.id, payload);
              }

              if (payload?.value) {
                setFullName(payload.value);
              }
            })
            .finally(() => {
              loadingSpinnerGroup.destroy();
            });
        })
        /**
         * DROPDOWN FIELD.
         */
        .with({ type: FieldType.DROPDOWN }, (field) => {
          handleDropdownFieldClick({ field, text: null })
            .then(async (payload) => {
              if (payload) {
                fieldGroup.add(loadingSpinnerGroup);
                await signField(field.id, payload);
              }

              loadingSpinnerGroup.destroy();
            })
            .finally(() => {
              loadingSpinnerGroup.destroy();
            });
        })
        /**
         * DATE FIELD.
         */
        .with({ type: FieldType.DATE }, (field) => {
          const dateField = field as TFieldDate;
          const dateSelection = dateField.fieldMeta.autoFill
            ? Promise.resolve({
                type: FieldType.DATE,
                value: !field.inserted,
              } satisfies TSignEnvelopeFieldValue)
            : handleDateFieldClick({
                field: dateField,
                dateFormat: envelope.documentMeta.dateFormat,
                timezone: envelope.documentMeta.timezone,
              });

          void dateSelection
            .then(async (payload) => {
              if (payload) {
                fieldGroup.add(loadingSpinnerGroup);
                await signField(field.id, payload);
              }
            })
            .finally(() => {
              loadingSpinnerGroup.destroy();
            });
        })
        /**
         * SIGNATURE FIELD.
         */
        .with({ type: FieldType.SIGNATURE }, (field) => {
          handleSignatureFieldClick({
            field,
            fullName,
            signature,
            signatureFont,
            typedSignatureEnabled: envelope.documentMeta.typedSignatureEnabled,
            uploadSignatureEnabled: envelope.documentMeta.uploadSignatureEnabled,
            drawSignatureEnabled: envelope.documentMeta.drawSignatureEnabled,
          })
            .then(async (payload) => {
              if (payload) {
                fieldGroup.add(loadingSpinnerGroup);

                if (payload.value) {
                  void executeActionAuthProcedure({
                    onReauthFormSubmit: async (authOptions) => {
                      await signField(field.id, payload, authOptions);

                      loadingSpinnerGroup.destroy();
                    },
                    actionTarget: field.type,
                  });

                  setSignature(payload.value);
                  setSignatureFont(payload.signatureFont ?? null);
                } else {
                  await signField(field.id, payload);
                }
              }
            })
            .finally(() => {
              loadingSpinnerGroup.destroy();
            });
        })
        .exhaustive();
    };

    fieldGroup.off('pointerdown');
    fieldGroup.off('click');

    if (unparsedField.type === FieldType.TEXT || unparsedField.type === FieldType.NUMBER) {
      fieldGroup.on('click', handleFieldGroupClick);
    } else {
      fieldGroup.on('pointerdown', handleFieldGroupClick);
    }
  };

  const renderFieldOnLayer = (unparsedField: Field & { signature?: Signature | null }) => {
    try {
      unsafeRenderFieldOnLayer(unparsedField);
    } catch (err) {
      console.error(err);
      setRenderError(true);
    }
  };

  const renderFields = () => {
    if (!pageLayer.current) {
      console.error('Layer not loaded yet');
      return;
    }

    const fieldsToRender = [...localPageFields, ...localPageOtherRecipientFields];
    const fieldIdsToRender = new Set(fieldsToRender.map((field) => field.id.toString()));

    pageLayer.current.find('.field-group').forEach((fieldGroup) => {
      if (!fieldIdsToRender.has(fieldGroup.id())) {
        fieldGroup.destroy();
      }
    });

    // Render current recipient fields.
    for (const field of localPageFields) {
      renderFieldOnLayer(field);
    }

    // Render other recipient signed and inserted fields.
    for (const field of localPageOtherRecipientFields) {
      try {
        const { fieldGroup } = renderField({
          scale,
          pageLayer: pageLayer.current,
          field: {
            renderId: field.id.toString(),
            ...field,
            width: Number(field.width),
            height: Number(field.height),
            positionX: Number(field.positionX),
            positionY: Number(field.positionY),
            fieldMeta: field.fieldMeta,
          },
          translations: getClientSideFieldTranslations(i18n),
          pageWidth: unscaledViewport.width,
          pageHeight: unscaledViewport.height,
          color: 'readOnly',
          editable: false,
          mode: 'sign',
        });

        fieldGroup.listening(false);
      } catch (err) {
        console.error('Unable to render one or more fields belonging to other recipients.');
        console.error(err);
      }
    }
  };

  const signField = async (fieldId: number, payload: TSignEnvelopeFieldValue, authOptions?: TRecipientActionAuth) => {
    try {
      const { inserted } = await signFieldInternal(fieldId, payload, authOptions);

      // ?: The two callbacks below are used within the embedding context
      if (inserted && onFieldSigned) {
        const value = payload.value ? JSON.stringify(payload.value) : undefined;
        const isBase64 = value ? isBase64Image(value) : undefined;

        onFieldSigned({ fieldId, value, isBase64 });
      }

      if (!inserted && onFieldUnsigned) {
        onFieldUnsigned({ fieldId });
      }
    } catch (err) {
      console.error(err);

      toast({
        title: t`Error`,
        description: t`An error occurred while signing the field.`,
        variant: 'destructive',
      });

      throw err;
    }
  };

  const handleInlineFieldCommit = async (
    field: TFieldText | TFieldNumber,
    value: string,
    direction: 'next' | 'previous' | null,
  ) => {
    await signField(field.id, {
      type: field.type,
      value: value || null,
    });

    if (inlineFieldIdRef.current !== field.id) {
      return;
    }

    if (!direction) {
      setInlineFieldId(null);
      return;
    }

    const currentIndex = inlineEditableFields.findIndex((candidate) => candidate.id === field.id);
    const directionOffset = direction === 'next' ? 1 : -1;
    const nextField = inlineEditableFields[currentIndex + directionOffset];

    if (!nextField) {
      setInlineFieldId(null);
      return;
    }

    const isEnvelopeItemSwitch = nextField.envelopeItemId !== currentEnvelopeItem?.id;

    if (isEnvelopeItemSwitch) {
      setCurrentEnvelopeItem(nextField.envelopeItemId);
    }

    setInlineFieldId(nextField.id);

    setTimeout(
      () => {
        const pdfContent = document.querySelector(PDF_VIEWER_CONTENT_SELECTOR);

        if (pdfContent) {
          pdfContent.setAttribute('data-scroll-to-page', String(nextField.page));
        }
      },
      isEnvelopeItemSwitch ? 150 : 50,
    );
  };

  /**
   * Initialize the Konva page canvas and all fields and interactions.
   */
  const createPageCanvas = (currentStage: Konva.Stage, currentPageLayer: Konva.Layer) => {
    renderFields();
    currentPageLayer.batchDraw();
  };

  /**
   * Render fields when they are changed or inserted.
   */
  useEffect(() => {
    if (!pageLayer.current || !stage.current) {
      return;
    }

    renderFields();

    pageLayer.current.batchDraw();
  }, [localPageFields, showPendingFieldTooltip, fullName, signature, email]);

  /**
   * Rerender the whole page if the selected assistant recipient changes.
   */
  useEffect(() => {
    if (!pageLayer.current || !stage.current) {
      return;
    }

    // Rerender the whole page.
    pageLayer.current.destroyChildren();

    renderFields();

    pageLayer.current.batchDraw();
  }, [selectedAssistantRecipient]);

  if (!currentEnvelopeItem) {
    return null;
  }

  return (
    <>
      {showPendingFieldTooltip &&
        recipientFieldsRemaining.length > 0 &&
        recipientFieldsRemaining[0]?.envelopeItemId === currentEnvelopeItem?.id &&
        recipientFieldsRemaining[0]?.page === pageNumber && (
          <EnvelopeFieldToolTip
            key={recipientFieldsRemaining[0].id}
            field={recipientFieldsRemaining[0]}
            color="warning"
          >
            <Trans>Click to insert field</Trans>
          </EnvelopeFieldToolTip>
        )}

      {localPageOtherRecipientFields.map((field) => (
        <EnvelopeRecipientFieldTooltip
          key={field.id}
          field={field}
          showFieldStatus={true}
          showRecipientTooltip={true}
        />
      ))}

      {localInlineField && (
        <div className="pointer-events-none absolute inset-0 z-20">
          <InlineFieldEditor
            key={localInlineField.id}
            field={localInlineField}
            pageHeight={unscaledViewport.height}
            pageWidth={unscaledViewport.width}
            scale={scale}
            onCancel={() => setInlineFieldId(null)}
            onCommit={(value, direction) => handleInlineFieldCommit(localInlineField, value, direction)}
          />
        </div>
      )}

      {/* The element Konva will inject it's canvas into. */}
      <div className="konva-container absolute inset-0 z-10 w-full" ref={konvaContainer}></div>
    </>
  );
};
