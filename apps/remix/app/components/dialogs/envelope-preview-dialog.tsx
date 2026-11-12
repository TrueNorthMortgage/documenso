import { zodResolver } from '@hookform/resolvers/zod';
import { useCopyToClipboard } from '@documenso/lib/client-only/hooks/use-copy-to-clipboard';
import { AppError } from '@documenso/lib/errors/app-error';
import { zEmail } from '@documenso/lib/utils/zod';
import { trpc } from '@documenso/trpc/react';
import { Alert, AlertDescription } from '@documenso/ui/primitives/alert';
import { Button } from '@documenso/ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@documenso/ui/primitives/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@documenso/ui/primitives/form/form';
import { Input } from '@documenso/ui/primitives/input';
import { Textarea } from '@documenso/ui/primitives/textarea';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { Trans, useLingui } from '@lingui/react/macro';
import { RecipientRole } from '@prisma/client';
import { CopyIcon, PlusIcon, XIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';

const ZPreviewFormSchema = z.object({
  recipients: z
    .array(z.object({ email: zEmail() }))
    .min(1)
    .max(10),
  subject: z.string().trim().max(200),
  message: z.string().trim().max(5000),
});

type EnvelopePreviewDialogProps = {
  envelopeId: string;
  title: string;
  recipients: { email: string; role: RecipientRole }[];
  trigger: ReactNode;
  beforeSend?: () => Promise<unknown>;
  isCorrecting?: boolean;
};

export const EnvelopePreviewDialog = ({
  envelopeId,
  title,
  recipients,
  trigger,
  beforeSend,
  isCorrecting = false,
}: EnvelopePreviewDialogProps) => {
  const { t } = useLingui();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>();
  const [isSent, setIsSent] = useState(false);
  const [copiedUrl, copy] = useCopyToClipboard();
  const utils = trpc.useUtils();
  const previewQuery = trpc.envelope.preview.get.useQuery({ envelopeId }, { enabled: isOpen });
  const sharedPreview = previewQuery.data;
  const previewUrl = sharedPreview?.previewUrl;
  const sendPreview = trpc.envelope.preview.send.useMutation();
  const form = useForm<z.infer<typeof ZPreviewFormSchema>>({ resolver: zodResolver(ZPreviewFormSchema) });
  const { fields, append, remove, replace } = useFieldArray({ control: form.control, name: 'recipients' });
  const isSending = form.formState.isSubmitting;
  const canSubmit = !previewQuery.isPending && !previewQuery.isError;

  const resetFields = (prefill: boolean) => {
    const signers = recipients.filter((recipient) => recipient.role === RecipientRole.SIGNER && recipient.email);
    form.reset({
      recipients: [{ email: prefill && signers.length === 1 ? signers[0].email : '' }],
      subject: t`Preview: ${title}`.replace(/[\r\n]+/g, ' ').slice(0, 200),
      message: '',
    });
  };

  const onOpenChange = (open: boolean) => {
    if (isSending) {
      return;
    }

    if (open) {
      resetFields(!utils.envelope.preview.get.getData({ envelopeId }));
      setErrorMessage(undefined);
      setIsSent(false);
    }

    setIsOpen(open);
  };

  const onSubmit = form.handleSubmit(async ({ recipients, subject, message }) => {
    if (!canSubmit) {
      return;
    }

    setErrorMessage(undefined);
    setIsSent(false);

    try {
      await beforeSend?.();

      const result = await sendPreview.mutateAsync({
        envelopeId,
        emails: recipients.map(({ email }) => email),
        subject,
        message,
      });

      if (result.sharedPreview) {
        utils.envelope.preview.get.setData({ envelopeId }, result.sharedPreview);
      }

      if (result.failedEmails.length > 0) {
        replace(result.failedEmails.map((email) => ({ email })));
        setErrorMessage(t`Some preview emails could not be sent. You can retry the addresses shown above.`);
      } else {
        setIsSent(true);
        replace([{ email: '' }]);
        toast({ title: t`Preview link sent.`, duration: 5000 });
      }

      void utils.document.auditLog.find.invalidate();
      void utils.envelope.auditLog.find.invalidate();
    } catch (error) {
      const appError = AppError.parseError(error);
      setErrorMessage(appError.userMessage || t`Could not send the preview link.`);
    }
  });

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto" hideClose>
        <DialogHeader>
          <DialogTitle>
            <Trans>Send preview link</Trans>
          </DialogTitle>
          <DialogDescription>
            {isCorrecting ? (
              <Trans>Sending reopens the same link for everyone who has it until this correction ends.</Trans>
            ) : (
              <Trans>Anyone with the link can view the latest saved version while the envelope is in Draft.</Trans>
            )}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit}>
            {previewQuery.isPending && (
              <p role="status" className="text-muted-foreground text-sm">
                <Trans>Loading preview link…</Trans>
              </p>
            )}
            {previewQuery.isError && (
              <Alert variant="destructive">
                <AlertDescription>
                  <Trans>Could not check whether a preview has been shared.</Trans>
                </AlertDescription>
              </Alert>
            )}
            <fieldset hidden={!canSubmit} disabled={isSending || !canSubmit} className="min-w-0 space-y-4">
              <div role="group" aria-label={t`Recipients`} className="space-y-2">
                <p className="font-medium text-sm">
                  <Trans>To</Trans>
                </p>
                {fields.map((item, index) => (
                  <FormField
                    key={item.id}
                    control={form.control}
                    name={`recipients.${index}.email`}
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex gap-2">
                          <FormControl>
                            <Input
                              {...field}
                              type="email"
                              aria-label={t`Recipient email`}
                              placeholder="email@example.com"
                            />
                          </FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            aria-label={t`Remove recipient email`}
                            disabled={fields.length === 1}
                            onClick={() => remove(index)}
                          >
                            <XIcon className="h-4 w-4" />
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={fields.length >= 10}
                  onClick={() => append({ email: '' })}
                >
                  <PlusIcon className="mr-2 h-4 w-4" />
                  <Trans>Add email</Trans>
                </Button>
              </div>

              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <Trans>Subject</Trans>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} maxLength={200} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <Trans>Message (Optional)</Trans>
                    </FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={3} maxLength={5000} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </fieldset>

            {sharedPreview && (
              <div className={canSubmit ? 'mt-4 space-y-2' : 'space-y-2'}>
                <p role="status" className="text-sm">
                  {isSent ? (
                    <Trans>Preview link sent.</Trans>
                  ) : sharedPreview.isActive ? (
                    <Trans>Already shared</Trans>
                  ) : (
                    <Trans>Preview link inactive</Trans>
                  )}
                </p>
                {previewUrl ? (
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label={t`Preview link`}
                      value={previewUrl}
                      readOnly
                      onFocus={(event) => event.currentTarget.select()}
                    />
                    <Button type="button" variant="outline" onClick={() => void copy(previewUrl)}>
                      <CopyIcon className="mr-2 h-4 w-4" />
                      {copiedUrl === previewUrl ? <Trans>Copied</Trans> : <Trans>Copy link</Trans>}
                    </Button>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    <Trans>Send the preview to get a copyable link.</Trans>
                  </p>
                )}
              </div>
            )}
            {errorMessage && (
              <Alert variant="destructive" className="mt-3">
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" disabled={isSending} onClick={() => onOpenChange(false)}>
                <Trans>Close</Trans>
              </Button>
              {canSubmit && (
                <Button type="submit" loading={isSending}>
                  <Trans>Send preview link</Trans>
                </Button>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
