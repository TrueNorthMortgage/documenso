import type { SignatureFontFamily } from '@documenso/lib/constants/signatures';
import type { DocumentAndSender } from '@documenso/lib/server-only/document/get-document-by-token';
import type { TRecipientAccessAuth, TRecipientActionAuth } from '@documenso/lib/types/document-auth';
import { getFieldsRequiringValidation } from '@documenso/lib/utils/advanced-fields-helpers';
import { sortFieldsByPosition } from '@documenso/lib/utils/fields';
import { getFilledIdentityFieldsToUpdate } from '@documenso/lib/utils/signing-identity';
import { isSignatureFieldType } from '@documenso/prisma/guards/is-signature-field';
import type { RecipientWithFields } from '@documenso/prisma/types/recipient-with-fields';
import { trpc } from '@documenso/trpc/react';
import { FieldToolTip } from '@documenso/ui/components/field/field-tooltip';
import { Button } from '@documenso/ui/primitives/button';
import { Label } from '@documenso/ui/primitives/label';
import { RadioGroup, RadioGroupItem } from '@documenso/ui/primitives/radio-group';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { type Field, FieldType, type Recipient, RecipientRole } from '@prisma/client';
import { useId, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useRevalidator } from 'react-router';
import { AssistantConfirmationDialog, type NextSigner } from '../../dialogs/assistant-confirmation-dialog';
import { DocumentSigningCompleteDialog } from './document-signing-complete-dialog';
import { DocumentSigningIdentityInput } from './document-signing-identity-input';
import { useRequiredDocumentSigningContext } from './document-signing-provider';
import { useDocumentSigningRecipientContext } from './document-signing-recipient-provider';
import { DocumentSigningSignatureInput } from './document-signing-signature-input';

export type DocumentSigningFormProps = {
  document: DocumentAndSender;
  recipient: Recipient;
  fields: Field[];
  isRecipientsTurn: boolean;
  allRecipients?: RecipientWithFields[];
  setSelectedSignerId?: (id: number | null) => void;
  completeDocument: (options: {
    accessAuthOptions?: TRecipientAccessAuth;
    nextSigner?: { email: string; name: string };
  }) => Promise<void>;
  isSubmitting: boolean;
  fieldsValidated: () => void;
  nextRecipient?: RecipientWithFields;
};

export const DocumentSigningForm = ({
  document,
  recipient,
  fields,
  isRecipientsTurn,
  allRecipients = [],
  setSelectedSignerId,
  completeDocument,
  isSubmitting,
  fieldsValidated,
  nextRecipient,
}: DocumentSigningFormProps) => {
  const { _ } = useLingui();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { revalidate } = useRevalidator();
  const { targetSigner } = useDocumentSigningRecipientContext();
  const { mutateAsync: replaceFilledSignatures } = trpc.envelope.field.replaceFilledSignatures.useMutation();
  const { mutateAsync: signFieldWithToken } = trpc.field.signFieldWithToken.useMutation();

  const assistantSignersId = useId();

  const {
    fullName,
    signature,
    signatureFont,
    setFullName,
    setSignature,
    setSignatureFont,
    initialsByRecipient,
    setInitials,
    isUpdatingIdentity,
    setIsUpdatingIdentity,
  } = useRequiredDocumentSigningContext();

  const [validateUninsertedFields, setValidateUninsertedFields] = useState(false);
  const [isConfirmationDialogOpen, setIsConfirmationDialogOpen] = useState(false);
  const [isAssistantSubmitting, setIsAssistantSubmitting] = useState(false);

  const assistantForm = useForm<{ selectedSignerId: number | undefined }>({
    defaultValues: {
      selectedSignerId: undefined,
    },
  });

  const fieldsRequiringValidation = useMemo(() => getFieldsRequiringValidation(fields), [fields]);

  const hasSignatureField = fields.some((field) => isSignatureFieldType(field.type));

  const activeRecipient = recipient.role === RecipientRole.ASSISTANT ? targetSigner : recipient;
  const initialsFields = fields.filter(
    (field) => field.type === FieldType.INITIALS && field.recipientId === activeRecipient?.id,
  );

  const updateIdentityFields = async (type: typeof FieldType.NAME | typeof FieldType.INITIALS, value: string) => {
    if (!activeRecipient || isUpdatingIdentity) {
      return;
    }

    setIsUpdatingIdentity(true);

    try {
      for (const field of getFilledIdentityFieldsToUpdate(fields, activeRecipient.id, type, value)) {
        await signFieldWithToken({ token: recipient.token, fieldId: field.id, value, isBase64: false });
      }

      if (type === FieldType.INITIALS) {
        setInitials(activeRecipient.id, value);
      } else {
        setFullName(value);
      }
    } finally {
      await revalidate();
      setIsUpdatingIdentity(false);
    }
  };

  const hasFilledSignatureFields = fields.some(
    (field) => field.recipientId === recipient.id && isSignatureFieldType(field.type) && field.inserted,
  );
  const updateSignature = async (
    value: string,
    font: SignatureFontFamily | null,
    authOptions?: TRecipientActionAuth,
  ) => {
    if (isUpdatingIdentity) {
      return;
    }

    setIsUpdatingIdentity(true);

    try {
      if (hasFilledSignatureFields) {
        await replaceFilledSignatures({ token: recipient.token, value, signatureFont: font, authOptions });
        await revalidate();
      }

      setSignature(value);
      setSignatureFont(font);
    } finally {
      setIsUpdatingIdentity(false);
    }
  };

  const initialsInput =
    initialsFields.length > 0 && activeRecipient ? (
      <DocumentSigningIdentityInput
        key={activeRecipient.id}
        label={<Trans>Initials</Trans>}
        value={
          initialsByRecipient[activeRecipient.id] ?? initialsFields.find((field) => field.inserted)?.customText ?? ''
        }
        disabled={isSubmitting || isUpdatingIdentity}
        onUpdate={(initials) => updateIdentityFields(FieldType.INITIALS, initials)}
      />
    ) : null;

  const uninsertedFields = useMemo(() => {
    return sortFieldsByPosition(fieldsRequiringValidation.filter((field) => !field.inserted));
  }, [fieldsRequiringValidation]);

  const uninsertedRecipientFields = useMemo(() => {
    return fieldsRequiringValidation.filter((field) => field.recipientId === recipient.id && !field.inserted);
  }, [fieldsRequiringValidation, recipient]);

  const localFieldsValidated = () => {
    setValidateUninsertedFields(true);
    fieldsValidated();
  };

  const onAssistantFormSubmit = () => {
    if (uninsertedRecipientFields.length > 0) {
      return;
    }

    setIsConfirmationDialogOpen(true);
  };

  const handleAssistantConfirmDialogSubmit = async (nextSigner?: NextSigner) => {
    setIsAssistantSubmitting(true);

    try {
      await completeDocument({ nextSigner });
    } catch (err) {
      toast({
        title: _(msg`Error`),
        description: _(msg`An error occurred while completing the document. Please try again.`),
        variant: 'destructive',
      });

      setIsAssistantSubmitting(false);
      setIsConfirmationDialogOpen(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {validateUninsertedFields && uninsertedFields[0] && (
        <FieldToolTip key={uninsertedFields[0].id} field={uninsertedFields[0]} color="warning">
          <Trans>Click to insert field</Trans>
        </FieldToolTip>
      )}

      <div className="custom-scrollbar -mx-2 flex flex-1 flex-col overflow-y-auto overflow-x-hidden px-2">
        <div className="flex flex-1 flex-col">
          {recipient.role === RecipientRole.VIEWER ? (
            <div className="-mx-2 flex flex-1 flex-col gap-4 overflow-y-auto px-2">
              <div className="flex flex-1 flex-col gap-y-4" />
              <div className="flex flex-col gap-4 md:flex-row">
                <Button
                  type="button"
                  className="w-full bg-black/5 hover:bg-black/10 dark:bg-muted dark:hover:bg-muted/80"
                  variant="secondary"
                  size="lg"
                  disabled={typeof window !== 'undefined' && window.history.length <= 1}
                  onClick={async () => navigate(-1)}
                >
                  <Trans>Cancel</Trans>
                </Button>

                <DocumentSigningCompleteDialog
                  isSubmitting={isSubmitting}
                  documentTitle={document.title}
                  fields={fields}
                  fieldsValidated={localFieldsValidated}
                  onSignatureComplete={async (nextSigner, accessAuthOptions) =>
                    completeDocument({ nextSigner, accessAuthOptions })
                  }
                  recipient={recipient}
                  allowDictateNextSigner={document.documentMeta?.allowDictateNextSigner}
                  defaultNextSigner={
                    nextRecipient ? { name: nextRecipient.name, email: nextRecipient.email } : undefined
                  }
                />
              </div>
            </div>
          ) : recipient.role === RecipientRole.ASSISTANT ? (
            <form onSubmit={assistantForm.handleSubmit(onAssistantFormSubmit)}>
              <fieldset className="rounded-2xl border border-border bg-white p-3 dark:bg-background">
                <Controller
                  name="selectedSignerId"
                  control={assistantForm.control}
                  rules={{ required: 'Please select a signer' }}
                  render={({ field }) => (
                    <RadioGroup
                      className="gap-0 space-y-3 shadow-none"
                      value={field.value?.toString()}
                      onValueChange={(value) => {
                        field.onChange(value);
                        setSelectedSignerId?.(Number(value));
                      }}
                    >
                      {allRecipients
                        .filter((r) => r.fields.length > 0)
                        .map((r) => (
                          <div
                            key={`${assistantSignersId}-${r.id}`}
                            className="relative flex flex-col gap-4 rounded-lg border border-border bg-widget p-4"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <RadioGroupItem
                                  id={`${assistantSignersId}-${r.id}`}
                                  value={r.id.toString()}
                                  className="after:absolute after:inset-0"
                                />

                                <div className="grid grow gap-1">
                                  <Label className="inline-flex items-start" htmlFor={`${assistantSignersId}-${r.id}`}>
                                    {r.name}

                                    {r.id === recipient.id && (
                                      <span className="ml-2 text-muted-foreground">{_(msg`(You)`)}</span>
                                    )}
                                  </Label>
                                  <p className="text-muted-foreground text-xs">{r.email}</p>
                                </div>
                              </div>
                              <div className="text-muted-foreground text-xs leading-[inherit]">
                                {r.fields.length} {r.fields.length === 1 ? 'field' : 'fields'}
                              </div>
                            </div>
                          </div>
                        ))}
                    </RadioGroup>
                  )}
                />
              </fieldset>

              <div className="mt-4">{initialsInput}</div>

              <div className="mt-6 flex flex-col gap-4 md:flex-row">
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  loading={isAssistantSubmitting || isUpdatingIdentity}
                >
                  <Trans>Continue</Trans>
                </Button>
              </div>

              <AssistantConfirmationDialog
                hasUninsertedFields={uninsertedFields.length > 0}
                isOpen={isConfirmationDialogOpen}
                onClose={() => !isAssistantSubmitting && setIsConfirmationDialogOpen(false)}
                onConfirm={handleAssistantConfirmDialogSubmit}
                isSubmitting={isAssistantSubmitting}
                allowDictateNextSigner={nextRecipient && document.documentMeta?.allowDictateNextSigner}
                defaultNextSigner={nextRecipient ? { name: nextRecipient.name, email: nextRecipient.email } : undefined}
              />
            </form>
          ) : (
            <>
              <fieldset disabled={isSubmitting} className="-mx-2 flex flex-1 flex-col gap-4 overflow-y-auto px-2">
                <div className="flex flex-1 flex-col gap-y-4">
                  <DocumentSigningIdentityInput
                    label={<Trans>Full Name</Trans>}
                    value={fullName}
                    disabled={isSubmitting || isUpdatingIdentity}
                    onUpdate={(name) => updateIdentityFields(FieldType.NAME, name)}
                  />

                  {initialsInput}

                  {hasSignatureField && (
                    <div>
                      <Label htmlFor="Signature">
                        <Trans>Signature</Trans>
                      </Label>

                      <DocumentSigningSignatureInput
                        className="mt-2"
                        disabled={isSubmitting}
                        fullName={fullName}
                        value={signature ?? ''}
                        hasFilledFields={hasFilledSignatureFields}
                        onUpdate={updateSignature}
                        signatureFont={signatureFont ?? undefined}
                        typedSignatureEnabled={document.documentMeta?.typedSignatureEnabled}
                        uploadSignatureEnabled={document.documentMeta?.uploadSignatureEnabled}
                        drawSignatureEnabled={document.documentMeta?.drawSignatureEnabled}
                      />
                    </div>
                  )}
                </div>
              </fieldset>

              <div className="mt-6 flex flex-col gap-4 md:flex-row">
                <Button
                  type="button"
                  className="w-full bg-black/5 hover:bg-black/10 dark:bg-muted dark:hover:bg-muted/80"
                  variant="secondary"
                  size="lg"
                  disabled={typeof window !== 'undefined' && window.history.length <= 1}
                  onClick={async () => navigate(-1)}
                >
                  <Trans>Cancel</Trans>
                </Button>

                <DocumentSigningCompleteDialog
                  isSubmitting={isSubmitting || isAssistantSubmitting || isUpdatingIdentity}
                  documentTitle={document.title}
                  fields={fields}
                  fieldsValidated={localFieldsValidated}
                  disabled={!isRecipientsTurn || isUpdatingIdentity}
                  onSignatureComplete={async (nextSigner, accessAuthOptions) =>
                    completeDocument({
                      accessAuthOptions,
                      nextSigner,
                    })
                  }
                  recipient={recipient}
                  allowDictateNextSigner={nextRecipient && document.documentMeta?.allowDictateNextSigner}
                  defaultNextSigner={
                    nextRecipient ? { name: nextRecipient.name, email: nextRecipient.email } : undefined
                  }
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
