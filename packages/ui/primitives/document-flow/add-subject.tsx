import { useAutoSave } from '@documenso/lib/client-only/hooks/use-autosave';
import { useCurrentOrganisation } from '@documenso/lib/client-only/providers/organisation';
import type { TDocument } from '@documenso/lib/types/document';
import { ZDocumentEmailSettingsSchema } from '@documenso/lib/types/document-email';
import type { TRecipientLite } from '@documenso/lib/types/recipient';
import { trpc } from '@documenso/trpc/react';
import { DocumentSendEmailMessageHelper } from '@documenso/ui/components/document/document-send-email-message-helper';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@documenso/ui/primitives/form/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@documenso/ui/primitives/select';
import { Tabs, TabsList, TabsTrigger } from '@documenso/ui/primitives/tabs';
import { zodResolver } from '@hookform/resolvers/zod';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import type { Field } from '@prisma/client';
import { DocumentDistributionMethod, DocumentStatus } from '@prisma/client';
import { AnimatePresence, motion } from 'framer-motion';
import { InfoIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';

import { DocumentEmailCheckboxes } from '../../components/document/document-email-checkboxes';
import { DocumentReadOnlyFields, mapFieldsWithRecipients } from '../../components/document/document-read-only-fields';
import { Input } from '../input';
import { useStep } from '../stepper';
import { Textarea } from '../textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '../tooltip';
import { type TAddSubjectFormSchema, ZAddSubjectFormSchema } from './add-subject.types';
import {
  DocumentFlowFormContainerActions,
  DocumentFlowFormContainerContent,
  DocumentFlowFormContainerFooter,
  DocumentFlowFormContainerHeader,
  DocumentFlowFormContainerStep,
} from './document-flow-root';
import type { DocumentFlowStep } from './types';

export type AddSubjectFormProps = {
  documentFlow: DocumentFlowStep;
  recipients: TRecipientLite[];
  fields: Field[];
  document: TDocument;
  onSubmit: (_data: TAddSubjectFormSchema) => void;
  onAutoSave: (_data: TAddSubjectFormSchema) => Promise<void>;
  isDocumentPdfLoaded: boolean;
};

export const AddSubjectFormPartial = ({
  documentFlow,
  recipients,
  fields,
  document,
  onSubmit,
  onAutoSave,
  isDocumentPdfLoaded,
}: AddSubjectFormProps) => {
  const { _ } = useLingui();

  const organisation = useCurrentOrganisation();

  const form = useForm<TAddSubjectFormSchema>({
    defaultValues: {
      meta: {
        emailId: document.documentMeta?.emailId ?? null,
        emailReplyTo: document.documentMeta?.emailReplyTo || undefined,
        // emailReplyName: document.documentMeta?.emailReplyName || undefined,
        subject: document.documentMeta?.subject ?? '',
        message: document.documentMeta?.message ?? '',
        distributionMethod: DocumentDistributionMethod.EMAIL,
        emailSettings: ZDocumentEmailSettingsSchema.parse(document?.documentMeta?.emailSettings),
      },
    },
    resolver: zodResolver(ZAddSubjectFormSchema),
  });

  const {
    handleSubmit,
    setValue,
    watch,
    trigger,
    getValues,
    formState: { isSubmitting },
  } = form;

  const { data: emailData, isLoading: isLoadingEmails } = trpc.enterprise.organisation.email.find.useQuery({
    organisationId: organisation.id,
    perPage: 100,
  });

  const emails = emailData?.data || [];

  const goNextLabel = {
    [DocumentDistributionMethod.EMAIL]: {
      [DocumentStatus.DRAFT]: msg`Send`,
      [DocumentStatus.PENDING]: recipients.some((recipient) => recipient.sendStatus === 'SENT')
        ? msg`Resend`
        : msg`Send`,
      [DocumentStatus.COMPLETED]: msg`Update`,
      [DocumentStatus.REJECTED]: msg`Update`,
    },
  };

  const distributionMethod = watch('meta.distributionMethod');
  const emailSettings = watch('meta.emailSettings');

  const onFormSubmit = handleSubmit(onSubmit);
  const { currentStep, totalSteps, previousStep } = useStep();

  const { scheduleSave } = useAutoSave(onAutoSave);

  const handleAutoSave = async () => {
    const isFormValid = await trigger();

    if (!isFormValid) {
      return;
    }

    const formData = getValues();

    scheduleSave(formData);
  };

  useEffect(() => {
    const container = window.document.getElementById('document-flow-form-container');

    const handleBlur = () => {
      void handleAutoSave();
    };

    if (container) {
      container.addEventListener('blur', handleBlur, true);
      return () => {
        container.removeEventListener('blur', handleBlur, true);
      };
    }
  }, []);

  return (
    <>
      <DocumentFlowFormContainerHeader title={documentFlow.title} description={documentFlow.description} />
      <DocumentFlowFormContainerContent>
        <div className="flex flex-col">
          {isDocumentPdfLoaded && (
            <DocumentReadOnlyFields
              showRecipientColors={true}
              recipientIds={recipients.map((recipient) => recipient.id)}
              fields={mapFieldsWithRecipients(fields, recipients)}
            />
          )}

          <Tabs
            onValueChange={(value) =>
              // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
              setValue('meta.distributionMethod', value as DocumentDistributionMethod)
            }
            value={distributionMethod}
            className="mb-2"
          >
            <TabsList className="w-full">
              <TabsTrigger className="w-full" value={DocumentDistributionMethod.EMAIL}>
                <Trans>Email</Trans>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <AnimatePresence mode="wait">
            {distributionMethod === DocumentDistributionMethod.EMAIL && (
              <motion.div
                key={'Emails'}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.3 } }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
              >
                <Form {...form}>
                  <fieldset
                    className="flex flex-col gap-y-4 rounded-lg border p-4"
                    disabled={form.formState.isSubmitting}
                  >
                    {organisation.organisationClaim.flags.emailDomains && (
                      <FormField
                        control={form.control}
                        name="meta.emailId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              <Trans>Email Sender</Trans>
                            </FormLabel>
                            <FormControl>
                              <Select
                                {...field}
                                value={field.value === null ? '-1' : field.value}
                                onValueChange={(value) => field.onChange(value === '-1' ? null : value)}
                              >
                                <SelectTrigger loading={isLoadingEmails} className="bg-background">
                                  <SelectValue />
                                </SelectTrigger>

                                <SelectContent>
                                  {emails.map((email) => (
                                    <SelectItem key={email.id} value={email.id}>
                                      {email.email}
                                    </SelectItem>
                                  ))}

                                  <SelectItem value={'-1'}>Documenso</SelectItem>
                                </SelectContent>
                              </Select>
                            </FormControl>

                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      control={form.control}
                      name="meta.emailReplyTo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            <Trans>
                              Reply To Email <span className="text-muted-foreground">(Optional)</span>
                            </Trans>
                          </FormLabel>

                          <FormControl>
                            <Input {...field} maxLength={254} />
                          </FormControl>

                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* <FormField
                      control={form.control}
                      name="meta.emailReplyName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            <Trans>Reply To Name</Trans>{' '}
                            <span className="text-muted-foreground">(Optional)</span>
                          </FormLabel>

                          <FormControl>
                            <Input {...field} />
                          </FormControl>

                          <FormMessage />
                        </FormItem>
                      )}
                    /> */}

                    <FormField
                      control={form.control}
                      name="meta.subject"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            <Trans>
                              Subject <span className="text-muted-foreground">(Optional)</span>
                            </Trans>
                          </FormLabel>

                          <FormControl>
                            <Input {...field} maxLength={255} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="meta.message"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex flex-row items-center">
                            <Trans>
                              Message <span className="text-muted-foreground">(Optional)</span>
                            </Trans>
                            <Tooltip>
                              <TooltipTrigger>
                                <InfoIcon className="mx-2 h-4 w-4" />
                              </TooltipTrigger>
                              <TooltipContent className="p-4 text-muted-foreground">
                                <DocumentSendEmailMessageHelper />
                              </TooltipContent>
                            </Tooltip>
                          </FormLabel>

                          <FormControl>
                            <Textarea className="mt-2 h-16 resize-none bg-background" {...field} maxLength={5000} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <DocumentEmailCheckboxes
                      className="mt-2"
                      value={emailSettings}
                      onChange={(value) => setValue('meta.emailSettings', value)}
                    />
                  </fieldset>
                </Form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DocumentFlowFormContainerContent>

      <DocumentFlowFormContainerFooter>
        <DocumentFlowFormContainerStep step={currentStep} maxStep={totalSteps} />

        <DocumentFlowFormContainerActions
          loading={isSubmitting}
          disabled={isSubmitting}
          goNextLabel={goNextLabel[DocumentDistributionMethod.EMAIL][document.status]}
          onGoBackClick={previousStep}
          onGoNextClick={() => void onFormSubmit()}
        />
      </DocumentFlowFormContainerFooter>
    </>
  );
};
