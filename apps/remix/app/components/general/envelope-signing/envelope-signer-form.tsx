import { isSignatureFieldType } from '@documenso/prisma/guards/is-signature-field';
import { Label } from '@documenso/ui/primitives/label';
import { RadioGroup, RadioGroupItem } from '@documenso/ui/primitives/radio-group';
import { Plural, Trans } from '@lingui/react/macro';
import { FieldType, RecipientRole } from '@prisma/client';
import { useMemo } from 'react';
import { useEmbedSigningContext } from '~/components/embed/embed-signing-context';
import { DocumentSigningIdentityInput } from '../document-signing/document-signing-identity-input';
import { DocumentSigningSignatureInput } from '../document-signing/document-signing-signature-input';
import { useRequiredEnvelopeSigningContext } from '../document-signing/envelope-signing-provider';

export default function EnvelopeSignerForm() {
  const {
    initialsByRecipient,
    updateInitials,
    isUpdatingIdentity,
    selectedAssistantRecipientFields,
    fullName,
    signature,
    signatureFont,
    updateFullName,
    updateSignature,
    envelope,
    recipientFields,
    recipient,
    assistantFields,
    assistantRecipients,
    selectedAssistantRecipient,
    setSelectedAssistantRecipientId,
  } = useRequiredEnvelopeSigningContext();

  const { isNameLocked, isEmailLocked } = useEmbedSigningContext() || {};

  const hasSignatureField = useMemo(() => {
    return recipientFields.some((field) => isSignatureFieldType(field.type));
  }, [recipientFields]);

  const isSubmitting = isUpdatingIdentity;
  const activeRecipient = recipient.role === RecipientRole.ASSISTANT ? selectedAssistantRecipient : recipient;
  const activeFields = recipient.role === RecipientRole.ASSISTANT ? selectedAssistantRecipientFields : recipientFields;
  const hasInitialsField = activeFields.some((field) => field.type === FieldType.INITIALS);
  const initialsInput =
    hasInitialsField && activeRecipient ? (
      <DocumentSigningIdentityInput
        key={activeRecipient.id}
        label={<Trans>Initials</Trans>}
        value={
          initialsByRecipient[activeRecipient.id] ??
          activeFields.find((field) => field.type === FieldType.INITIALS && field.inserted)?.customText ??
          ''
        }
        disabled={isSubmitting}
        onUpdate={(initials) => updateInitials(activeRecipient.id, initials)}
      />
    ) : null;

  if (recipient.role === RecipientRole.VIEWER) {
    return null;
  }

  if (recipient.role === RecipientRole.ASSISTANT) {
    return (
      <fieldset className="embed--DocumentWidgetForm rounded-2xl border-border sm:border sm:p-3 dark:bg-background">
        <RadioGroup
          className="gap-0 space-y-2 shadow-none sm:space-y-3"
          value={selectedAssistantRecipient?.id?.toString()}
          onValueChange={(value) => {
            setSelectedAssistantRecipientId(Number(value));
          }}
        >
          {assistantRecipients
            .filter((r) => r.fields.length > 0)
            .map((r) => (
              <div key={r.id} className="relative flex flex-col gap-4 rounded-lg border border-border bg-widget p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <RadioGroupItem
                      id={r.id.toString()}
                      value={r.id.toString()}
                      className="after:absolute after:inset-0"
                    />

                    <div className="grid grow gap-1">
                      <Label className="inline-flex items-start" htmlFor={r.id.toString()}>
                        {r.name}

                        {r.id === recipient.id && (
                          <span className="ml-2 text-muted-foreground">
                            <Trans>(You)</Trans>
                          </span>
                        )}
                      </Label>
                      <p className="text-muted-foreground text-xs">{r.email}</p>
                    </div>
                  </div>
                  <div className="text-muted-foreground text-xs leading-[inherit]">
                    <Plural
                      value={assistantFields.filter((field) => field.recipientId === r.id).length}
                      one="# field"
                      other="# fields"
                    />
                  </div>
                </div>
              </div>
            ))}
        </RadioGroup>
        <div className="mt-4">{initialsInput}</div>
      </fieldset>
    );
  }

  return (
    <fieldset disabled={isSubmitting} className="flex flex-1 flex-col gap-4">
      <div className="flex flex-1 flex-col gap-y-4">
        <DocumentSigningIdentityInput
          label={<Trans>Full Name</Trans>}
          value={fullName}
          disabled={isNameLocked || isSubmitting}
          onUpdate={updateFullName}
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
              hasFilledFields={recipientFields.some((field) => field.type === FieldType.SIGNATURE && field.inserted)}
              onUpdate={updateSignature}
              signatureFont={signatureFont ?? undefined}
              typedSignatureEnabled={envelope.documentMeta.typedSignatureEnabled}
              uploadSignatureEnabled={envelope.documentMeta.uploadSignatureEnabled}
              drawSignatureEnabled={envelope.documentMeta.drawSignatureEnabled}
            />
          </div>
        )}
      </div>
    </fieldset>
  );
}
