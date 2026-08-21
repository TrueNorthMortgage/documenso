import { useCurrentEnvelopeEditor } from '@documenso/lib/client-only/providers/envelope-editor-provider';
import { useCurrentEnvelopeRender } from '@documenso/lib/client-only/providers/envelope-render-provider';
import { IS_AI_FEATURES_CONFIGURED } from '@documenso/lib/constants/app';
import { PDF_VIEWER_ERROR_MESSAGES } from '@documenso/lib/constants/pdf-viewer-i18n';
import { DO_NOT_INVALIDATE_QUERY_ON_MUTATION } from '@documenso/lib/constants/trpc';
import type { NormalizedFieldWithContext } from '@documenso/lib/server-only/ai/envelope/detect-fields/types';
import type { TConditionalFieldRule } from '@documenso/lib/types/conditional-field';
import {
  FIELD_META_DEFAULT_VALUES,
  type TCheckboxFieldMeta,
  type TDateFieldMeta,
  type TDropdownFieldMeta,
  type TEmailFieldMeta,
  type TFieldMetaSchema,
  type TInitialsFieldMeta,
  type TNameFieldMeta,
  type TNumberFieldMeta,
  type TRadioFieldMeta,
  type TSignatureFieldMeta,
  type TTextFieldMeta,
} from '@documenso/lib/types/field-meta';
import { getEnvelopeItemPermissions } from '@documenso/lib/utils/envelope';
import { canRecipientFieldsBeModified } from '@documenso/lib/utils/recipients';
import { trpc } from '@documenso/trpc/react';
import { AnimateGenericFadeInOut } from '@documenso/ui/components/animate/animate-generic-fade-in-out';
import { cn } from '@documenso/ui/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@documenso/ui/primitives/alert';
import { Button } from '@documenso/ui/primitives/button';
import {
  ConditionalFieldSettings,
  getFieldDisplayName,
} from '@documenso/ui/primitives/document-flow/conditional-field-settings';
import { Separator } from '@documenso/ui/primitives/separator';
import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { DocumentStatus, FieldType, RecipientRole } from '@prisma/client';
import { EyeOffIcon, FileTextIcon, PencilIcon, SparklesIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRevalidator, useSearchParams } from 'react-router';
import { isDeepEqual } from 'remeda';
import { match } from 'ts-pattern';

import { AiFeaturesEnableDialog } from '~/components/dialogs/ai-features-enable-dialog';
import { AiFieldDetectionDialog } from '~/components/dialogs/ai-field-detection-dialog';
import { ApplyTemplateToEnvelopeItemDialog } from '~/components/dialogs/apply-template-to-envelope-item-dialog';
import { EnvelopeItemEditDialog } from '~/components/dialogs/envelope-item-edit-dialog';
import { EditorFieldCheckboxForm } from '~/components/forms/editor/editor-field-checkbox-form';
import { EditorFieldDateForm } from '~/components/forms/editor/editor-field-date-form';
import { EditorFieldDropdownForm } from '~/components/forms/editor/editor-field-dropdown-form';
import { EditorFieldEmailForm } from '~/components/forms/editor/editor-field-email-form';
import { EditorFieldGroupSettings } from '~/components/forms/editor/editor-field-group-settings';
import { EditorFieldInitialsForm } from '~/components/forms/editor/editor-field-initials-form';
import { EditorFieldNameForm } from '~/components/forms/editor/editor-field-name-form';
import { EditorFieldNumberForm } from '~/components/forms/editor/editor-field-number-form';
import { EditorFieldRadioForm } from '~/components/forms/editor/editor-field-radio-form';
import { EditorFieldSignatureForm } from '~/components/forms/editor/editor-field-signature-form';
import { EditorFieldTextForm } from '~/components/forms/editor/editor-field-text-form';
import { EnvelopePdfViewer } from '~/components/general/pdf-viewer/envelope-pdf-viewer';
import { useCurrentTeam } from '~/providers/team';

import { ConditionalFieldHighlightContext } from './conditional-field-highlight-context';
import { EnvelopeEditorFieldDragDrop } from './envelope-editor-fields-drag-drop';
import { EnvelopeEditorFieldsPageRenderer } from './envelope-editor-fields-page-renderer';
import { EnvelopeRendererFileSelector } from './envelope-file-selector';
import { EnvelopeRecipientSelector } from './envelope-recipient-selector';

const FieldSettingsTypeTranslations: Record<FieldType, MessageDescriptor> = {
  [FieldType.SIGNATURE]: msg`Signature Settings`,
  [FieldType.FREE_SIGNATURE]: msg`Free Signature Settings`,
  [FieldType.TEXT]: msg`Text Settings`,
  [FieldType.DATE]: msg`Date Settings`,
  [FieldType.EMAIL]: msg`Email Settings`,
  [FieldType.NAME]: msg`Name Settings`,
  [FieldType.INITIALS]: msg`Initials Settings`,
  [FieldType.NUMBER]: msg`Number Settings`,
  [FieldType.RADIO]: msg`Radio Settings`,
  [FieldType.CHECKBOX]: msg`Checkbox Settings`,
  [FieldType.DROPDOWN]: msg`Dropdown Settings`,
};

export const EnvelopeEditorFieldsPage = () => {
  const [searchParams] = useSearchParams();

  const team = useCurrentTeam();

  const scrollableContainerRef = useRef<HTMLDivElement>(null);

  const { envelope, editorFields, navigateToStep, editorConfig, syncEnvelope } = useCurrentEnvelopeEditor();

  const { currentEnvelopeItem } = useCurrentEnvelopeRender();

  const { _ } = useLingui();

  const { mutateAsync: createConditionalRule } = trpc.field.createConditionalFieldRule.useMutation(
    DO_NOT_INVALIDATE_QUERY_ON_MUTATION,
  );
  const { mutateAsync: deleteConditionalRule } = trpc.field.deleteConditionalFieldRule.useMutation(
    DO_NOT_INVALIDATE_QUERY_ON_MUTATION,
  );

  const [isAiFieldDialogOpen, setIsAiFieldDialogOpen] = useState(false);
  const [isAiEnableDialogOpen, setIsAiEnableDialogOpen] = useState(false);
  const [highlightedConditionalFieldIds, setHighlightedConditionalFieldIds] = useState<number[]>([]);
  const [conditionalSelectionFieldIds, setConditionalSelectionFieldIds] = useState<number[]>([]);
  const { revalidate } = useRevalidator();

  const highlightedConditionalFieldIdSet = useMemo(
    () => new Set(highlightedConditionalFieldIds),
    [highlightedConditionalFieldIds],
  );

  const envelopeItemPermissions = useMemo(
    () => getEnvelopeItemPermissions(envelope, envelope.recipients),
    [envelope, envelope.recipients],
  );

  const selectedField = useMemo(() => structuredClone(editorFields.selectedField), [editorFields.selectedField]);

  const conditionalFields = useMemo(
    () =>
      editorFields.localFields.map((field) => ({
        nativeId: field.id,
        formId: field.formId,
        pageNumber: field.page,
        pageX: field.positionX,
        pageY: field.positionY,
        pageWidth: field.width,
        pageHeight: field.height,
        signerEmail: envelope.recipients.find((recipient) => recipient.id === field.recipientId)?.email ?? '',
        recipientId: field.recipientId,
        type: field.type,
        fieldMeta: field.fieldMeta,
        conditionalChildRule: field.conditionalChildRule,
        conditionalParentRules: field.conditionalParentRules,
        envelopeItemId: field.envelopeItemId,
      })),
    [editorFields.localFields, envelope.recipients],
  );

  const conditionalFieldNames = useMemo(
    () =>
      new Map(
        conditionalFields.flatMap((field) =>
          field.nativeId ? [[field.nativeId, getFieldDisplayName(field, conditionalFields)] as const] : [],
        ),
      ),
    [conditionalFields],
  );

  const conditionalFieldHighlightContextValue = useMemo(
    () => ({
      highlightedFieldIds: highlightedConditionalFieldIdSet,
      selectionFieldIds: new Set(conditionalSelectionFieldIds),
      fieldNames: conditionalFieldNames,
    }),
    [conditionalFieldNames, conditionalSelectionFieldIds, highlightedConditionalFieldIdSet],
  );

  const selectedConditionalField = conditionalFields.find((field) => field.formId === selectedField?.formId);
  const selectedFieldMeta = selectedField?.fieldGroup
    ? {
        ...selectedField.fieldMeta,
        readOnly: selectedField.fieldGroup.readOnly,
        fontSize: selectedField.fieldGroup.fontSize ?? undefined,
        direction: selectedField.fieldGroup.direction === 'horizontal' ? 'horizontal' : 'vertical',
      }
    : selectedField?.fieldMeta;

  const updateConditionalRuleState = (rule: TConditionalFieldRule) => {
    for (const field of editorFields.localFields) {
      if (field.id === rule.childFieldId) {
        editorFields.updateFieldByFormId(field.formId, { conditionalChildRule: rule });
      }

      if (field.id === rule.parentFieldId) {
        editorFields.updateFieldByFormId(field.formId, {
          conditionalParentRules: [...(field.conditionalParentRules ?? []), rule],
        });
      }
    }
  };

  const removeConditionalRuleState = (childFieldId: number) => {
    const deletedRule = editorFields.localFields.find((field) => field.id === childFieldId)?.conditionalChildRule;

    for (const field of editorFields.localFields) {
      editorFields.updateFieldByFormId(field.formId, {
        conditionalChildRule: field.id === childFieldId ? null : field.conditionalChildRule,
        conditionalParentRules: deletedRule
          ? field.conditionalParentRules?.filter((rule) => rule.id !== deletedRule.id)
          : field.conditionalParentRules,
      });
    }
  };

  const updateSelectedFieldMeta = (fieldMeta: TFieldMetaSchema) => {
    if (!selectedField) {
      return;
    }

    const isMetaSame = isDeepEqual(selectedField.fieldMeta, fieldMeta);

    if (!isMetaSame) {
      if (selectedField.fieldGroupId) {
        editorFields.updateFieldGroupMeta(selectedField, fieldMeta);
      } else {
        editorFields.updateFieldByFormId(selectedField.formId, { fieldMeta });
      }
    }
  };

  const onFieldDetectionComplete = (fields: NormalizedFieldWithContext[]) => {
    for (const field of fields) {
      editorFields.addField({
        height: field.height,
        width: field.width,
        positionX: field.positionX,
        positionY: field.positionY,
        type: field.type,
        envelopeItemId: field.envelopeItemId,
        recipientId: field.recipientId,
        fieldGroupId: null,
        fieldGroup: null,
        page: field.pageNumber,
        fieldMeta: structuredClone(FIELD_META_DEFAULT_VALUES[field.type]),
      });
    }

    setIsAiFieldDialogOpen(false);
  };

  /**
   * Set the selected recipient to the first recipient in the envelope.
   */
  useEffect(() => {
    const firstSelectableRecipient = envelope.recipients.find(
      (recipient) => recipient.role === RecipientRole.SIGNER || recipient.role === RecipientRole.APPROVER,
    );

    editorFields.setSelectedRecipient(firstSelectableRecipient?.id ?? null);
  }, []);

  const onDetectClick = () => {
    if (!team.preferences.aiFeaturesEnabled) {
      setIsAiEnableDialogOpen(true);
      return;
    }

    setIsAiFieldDialogOpen(true);
  };

  const onAiFeaturesEnabled = () => {
    void revalidate().then(() => {
      setIsAiEnableDialogOpen(false);
      setIsAiFieldDialogOpen(true);
    });
  };

  const pageContent = (
    <div className="relative flex h-full">
      <div className="flex h-full w-full flex-col overflow-y-auto px-2" ref={scrollableContainerRef}>
        {/* Horizontal envelope item selector */}
        <EnvelopeRendererFileSelector
          className="px-0"
          fields={editorFields.localFields}
          renderItemAction={
            editorConfig.envelopeItems !== null &&
            editorConfig.envelopeItems.allowReplace &&
            envelopeItemPermissions.canFileBeChanged
              ? (item) => (
                  <div className="relative flex h-5 w-5 flex-shrink-0 items-center justify-center">
                    <div
                      className={cn('h-2 w-2 rounded-full transition-opacity duration-150 group-hover:opacity-0', {
                        'bg-green-500': currentEnvelopeItem?.id === item.id,
                      })}
                    />
                    <EnvelopeItemEditDialog
                      envelopeItem={item}
                      allowConfigureTitle={editorConfig.envelopeItems?.allowConfigureTitle ?? false}
                      trigger={
                        <span
                          className="absolute inset-0 flex cursor-pointer items-center justify-center opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`envelope-item-edit-button-${item.id}`}
                        >
                          <PencilIcon className="h-3.5 w-3.5" />
                        </span>
                      }
                    />
                  </div>
                )
              : undefined
          }
        />

        {/* Document View */}
        <div className="mt-4 flex h-full flex-col items-center justify-center">
          {envelope.recipients.length === 0 && (
            <Alert
              variant="neutral"
              className="mb-4 flex max-w-[800px] flex-row items-center justify-between space-y-0 rounded-sm border border-border bg-background"
            >
              <div className="flex flex-col gap-1">
                <AlertTitle>
                  <Trans>Missing Recipients</Trans>
                </AlertTitle>
                <AlertDescription>
                  <Trans>You need at least one recipient to add fields</Trans>
                </AlertDescription>
              </div>

              <Button variant="outline" onClick={() => void navigateToStep('upload')}>
                <Trans>Add Recipients</Trans>
              </Button>
            </Alert>
          )}

          {currentEnvelopeItem !== null ? (
            <EnvelopePdfViewer
              customPageRenderer={EnvelopeEditorFieldsPageRenderer}
              scrollParentRef={scrollableContainerRef}
              errorMessage={PDF_VIEWER_ERROR_MESSAGES.editor}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-32">
              <FileTextIcon className="h-10 w-10 text-muted-foreground" />
              <p className="mt-1 text-foreground text-sm">
                <Trans>No documents found</Trans>
              </p>
              <p className="mt-1 text-muted-foreground text-sm">
                <Trans>Please upload a document to continue</Trans>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Right Section - Form Fields Panel */}
      {currentEnvelopeItem && envelope.recipients.length > 0 && (
        <div className="sticky top-0 h-full w-80 flex-shrink-0 overflow-y-auto border-border border-l bg-background py-4">
          {/* Recipient selector section. */}
          <section className="px-4">
            <h3 className="mb-2 font-semibold text-foreground text-sm">
              <Trans>Selected Recipient</Trans>
            </h3>

            <EnvelopeRecipientSelector
              selectedRecipient={editorFields.selectedRecipient}
              onSelectedRecipientChange={(recipient) => editorFields.setSelectedRecipient(recipient.id)}
              recipients={envelope.recipients}
              fields={envelope.fields}
              className="w-full"
              align="end"
            />

            {editorFields.selectedRecipient &&
              !canRecipientFieldsBeModified(editorFields.selectedRecipient, envelope.fields) && (
                <Alert className="mt-4" variant="warning">
                  <AlertDescription>
                    <Trans>
                      This recipient can no longer be modified as they have signed a field, or completed the document.
                    </Trans>
                  </AlertDescription>
                </Alert>
              )}
          </section>

          <Separator className="my-4" />

          {/* Add fields section. */}
          <section className="px-4">
            <h3 className="mb-2 font-semibold text-foreground text-sm">
              <Trans>Add Fields</Trans>
            </h3>

            <EnvelopeEditorFieldDragDrop
              selectedRecipientId={editorFields.selectedRecipient?.id ?? null}
              selectedEnvelopeItemId={currentEnvelopeItem?.id ?? null}
            />

            <ApplyTemplateToEnvelopeItemDialog
              envelope={envelope}
              envelopeItemId={currentEnvelopeItem.id}
              onChanged={syncEnvelope}
              disabled={envelope.status !== DocumentStatus.DRAFT}
            />

            {editorConfig.fields?.allowAIDetection && IS_AI_FEATURES_CONFIGURED() && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4 w-full"
                  onClick={onDetectClick}
                  disabled={envelope.status !== DocumentStatus.DRAFT}
                  title={
                    envelope.status !== DocumentStatus.DRAFT
                      ? _(msg`You can only detect fields in draft envelopes`)
                      : undefined
                  }
                >
                  <SparklesIcon className="mr-2 -ml-1 h-4 w-4" />
                  <Trans>Detect with AI</Trans>
                </Button>

                <AiFieldDetectionDialog
                  open={isAiFieldDialogOpen}
                  onOpenChange={setIsAiFieldDialogOpen}
                  onComplete={onFieldDetectionComplete}
                  envelopeId={envelope.id}
                  teamId={envelope.teamId}
                />

                <AiFeaturesEnableDialog
                  open={isAiEnableDialogOpen}
                  onOpenChange={setIsAiEnableDialogOpen}
                  onEnabled={onAiFeaturesEnabled}
                />
              </>
            )}
          </section>

          {/* Field details section. */}
          <AnimateGenericFadeInOut key={editorFields.selectedField?.formId}>
            {selectedField && (
              <section>
                <Separator className="my-4" />

                {searchParams.get('devmode') && (
                  <>
                    <div className="px-4">
                      <h3 className="mb-3 font-semibold text-foreground text-sm">
                        <Trans>Developer Mode</Trans>
                      </h3>

                      <div className="space-y-2 rounded-md border border-border bg-muted/50 p-3 text-foreground text-sm">
                        {selectedField.id && (
                          <p>
                            <span className="min-w-12 text-muted-foreground">
                              <Trans>Field ID:</Trans>
                            </span>{' '}
                            {selectedField.id}
                          </p>
                        )}
                        <p>
                          <span className="min-w-12 text-muted-foreground">
                            <Trans>Recipient ID:</Trans>
                          </span>{' '}
                          {selectedField.recipientId}
                        </p>
                        <p>
                          <span className="min-w-12 text-muted-foreground">
                            <Trans>Pos X:</Trans>
                          </span>{' '}
                          {selectedField.positionX.toFixed(2)}
                        </p>
                        <p>
                          <span className="min-w-12 text-muted-foreground">
                            <Trans>Pos Y:</Trans>
                          </span>{' '}
                          {selectedField.positionY.toFixed(2)}
                        </p>
                        <p>
                          <span className="min-w-12 text-muted-foreground">
                            <Trans>Width:</Trans>
                          </span>{' '}
                          {selectedField.width.toFixed(2)}
                        </p>
                        <p>
                          <span className="min-w-12 text-muted-foreground">
                            <Trans>Height:</Trans>
                          </span>{' '}
                          {selectedField.height.toFixed(2)}
                        </p>
                      </div>
                    </div>

                    <Separator className="my-4" />
                  </>
                )}

                <div className="px-4 [&_label]:text-foreground/70 [&_label]:text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-sm">{_(FieldSettingsTypeTranslations[selectedField.type])}</h3>
                    {selectedConditionalField?.conditionalChildRule && (
                      <span
                        className="inline-flex items-center gap-1 rounded border border-amber-500/50 px-1.5 py-0.5 text-[10px] text-amber-500"
                        title={_(msg`This field is conditionally visible`)}
                      >
                        <EyeOffIcon className="h-3 w-3" aria-hidden="true" />
                        <span>Conditional</span>
                      </span>
                    )}
                  </div>
                  {selectedConditionalField && (
                    <p className="mt-1 text-muted-foreground text-xs">
                      Name:{' '}
                      <span className="font-medium text-foreground">
                        {getFieldDisplayName(selectedConditionalField, conditionalFields)}
                      </span>
                    </p>
                  )}

                  {match(selectedField.type)
                    .with(FieldType.SIGNATURE, () => (
                      <EditorFieldSignatureForm
                        value={selectedField?.fieldMeta as TSignatureFieldMeta | undefined}
                        onValueChange={(value) => updateSelectedFieldMeta(value)}
                      />
                    ))
                    .with(FieldType.CHECKBOX, () => (
                      <EditorFieldCheckboxForm
                        value={selectedFieldMeta as TCheckboxFieldMeta | undefined}
                        isGrouped={Boolean(selectedField.fieldGroupId)}
                        onValueChange={(value) => updateSelectedFieldMeta(value)}
                      />
                    ))
                    .with(FieldType.DATE, () => (
                      <EditorFieldDateForm
                        value={selectedField?.fieldMeta as TDateFieldMeta | undefined}
                        onValueChange={(value) => updateSelectedFieldMeta(value)}
                      />
                    ))
                    .with(FieldType.DROPDOWN, () => (
                      <EditorFieldDropdownForm
                        value={selectedField?.fieldMeta as TDropdownFieldMeta | undefined}
                        onValueChange={(value) => updateSelectedFieldMeta(value)}
                      />
                    ))
                    .with(FieldType.EMAIL, () => (
                      <EditorFieldEmailForm
                        value={selectedField?.fieldMeta as TEmailFieldMeta | undefined}
                        onValueChange={(value) => updateSelectedFieldMeta(value)}
                      />
                    ))
                    .with(FieldType.INITIALS, () => (
                      <EditorFieldInitialsForm
                        value={selectedField?.fieldMeta as TInitialsFieldMeta | undefined}
                        onValueChange={(value) => updateSelectedFieldMeta(value)}
                      />
                    ))
                    .with(FieldType.NAME, () => (
                      <EditorFieldNameForm
                        value={selectedField?.fieldMeta as TNameFieldMeta | undefined}
                        onValueChange={(value) => updateSelectedFieldMeta(value)}
                      />
                    ))
                    .with(FieldType.NUMBER, () => (
                      <EditorFieldNumberForm
                        value={selectedField?.fieldMeta as TNumberFieldMeta | undefined}
                        onValueChange={(value) => updateSelectedFieldMeta(value)}
                      />
                    ))
                    .with(FieldType.RADIO, () => (
                      <EditorFieldRadioForm
                        value={selectedFieldMeta as TRadioFieldMeta | undefined}
                        isGrouped={Boolean(selectedField.fieldGroupId)}
                        onValueChange={(value) => updateSelectedFieldMeta(value)}
                      />
                    ))
                    .with(FieldType.TEXT, () => (
                      <EditorFieldTextForm
                        value={selectedField?.fieldMeta as TTextFieldMeta | undefined}
                        onValueChange={(value) => updateSelectedFieldMeta(value)}
                      />
                    ))
                    .otherwise(() => null)}

                  <EditorFieldGroupSettings
                    field={selectedField}
                    fields={editorFields.localFields}
                    onCreateGroup={(name) => {
                      editorFields.createFieldGroup(selectedField, name);
                    }}
                    onAssignGroup={(group) => {
                      editorFields.assignFieldToGroup(selectedField, group);
                    }}
                    onUngroup={() => {
                      editorFields.ungroupField(selectedField);
                    }}
                  />

                  {selectedConditionalField && (
                    <ConditionalFieldSettings
                      field={selectedConditionalField}
                      fields={conditionalFields}
                      className="-mx-4"
                      onCreateRule={async (input) => {
                        const rule = await createConditionalRule(input);
                        updateConditionalRuleState(rule);
                        return rule;
                      }}
                      onDeleteRule={async (childFieldId) => {
                        await deleteConditionalRule({ childFieldId });
                        removeConditionalRuleState(childFieldId);
                      }}
                      onSelectedChildIdsChange={setHighlightedConditionalFieldIds}
                      onSelectionModeChange={setConditionalSelectionFieldIds}
                    />
                  )}
                </div>
              </section>
            )}
          </AnimateGenericFadeInOut>
        </div>
      )}
    </div>
  );

  return (
    <ConditionalFieldHighlightContext.Provider value={conditionalFieldHighlightContextValue}>
      {pageContent}
    </ConditionalFieldHighlightContext.Provider>
  );
};
