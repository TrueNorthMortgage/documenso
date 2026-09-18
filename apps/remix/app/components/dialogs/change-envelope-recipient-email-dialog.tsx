import { AppError } from '@documenso/lib/errors/app-error';
import { zEmail } from '@documenso/lib/utils/zod';
import { trpc } from '@documenso/trpc/react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@documenso/ui/primitives/select';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { PencilIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRevalidator } from 'react-router';
import { z } from 'zod';

const ZChangeEnvelopeRecipientEmailFormSchema = z.object({
  recipientId: z.number(),
  email: zEmail('Enter a valid email address.').trim().toLowerCase().max(254),
});

type TChangeEnvelopeRecipientEmailFormSchema = z.infer<typeof ZChangeEnvelopeRecipientEmailFormSchema>;

export type ChangeEnvelopeRecipientEmailDialogProps = {
  envelopeId: string;
  recipients: {
    id: number;
    email: string;
  }[];
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (_open: boolean) => void;
};

export const ChangeEnvelopeRecipientEmailDialog = ({
  envelopeId,
  recipients,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: ChangeEnvelopeRecipientEmailDialogProps) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const { t } = useLingui();
  const { toast } = useToast();
  const { revalidate } = useRevalidator();

  const form = useForm<TChangeEnvelopeRecipientEmailFormSchema>({
    resolver: zodResolver(ZChangeEnvelopeRecipientEmailFormSchema),
    defaultValues: {
      recipientId: recipients[0]?.id,
      email: recipients[0]?.email ?? '',
    },
  });

  const { mutateAsync: changeRecipientEmail } = trpc.envelope.recipient.changeEmail.useMutation();

  const isOpen = controlledOpen ?? uncontrolledOpen;
  const selectedRecipientId = form.watch('recipientId');
  const selectedRecipient = recipients.find((recipient) => recipient.id === selectedRecipientId);

  const setIsOpen = (value: boolean) => {
    if (controlledOpen === undefined) {
      setUncontrolledOpen(value);
    }

    onOpenChange?.(value);
  };

  const onFormSubmit = async ({ recipientId, email }: TChangeEnvelopeRecipientEmailFormSchema) => {
    if (!recipientId) {
      return;
    }

    try {
      await changeRecipientEmail({
        envelopeId,
        recipientId,
        email,
      });

      toast({
        title: t`Recipient email changed`,
        description: t`A new signing invitation has been sent to the updated email address.`,
      });

      setIsOpen(false);
      await revalidate();
    } catch (err) {
      const error = AppError.parseError(err);

      toast({
        title: t`Unable to change recipient email`,
        description: error.userMessage || t`Please try again.`,
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    if (!isOpen) {
      form.reset({
        recipientId: recipients[0]?.id,
        email: recipients[0]?.email ?? '',
      });
    }
  }, [form, isOpen, recipients]);

  return (
    <Dialog open={isOpen} onOpenChange={(value) => !form.formState.isSubmitting && setIsOpen(value)}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}

      {!trigger && controlledOpen === undefined && (
        <DialogTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="ml-2 h-7 px-2">
            <PencilIcon className="mr-1 h-3 w-3" />
            <Trans>Change email</Trans>
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            <Trans>Change recipient email</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>The existing signing link will stop working and a new invitation will be sent.</Trans>
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onFormSubmit)}>
            <fieldset disabled={form.formState.isSubmitting}>
              {recipients.length > 1 && (
                <FormField
                  control={form.control}
                  name="recipientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        <Trans>Recipient</Trans>
                      </FormLabel>
                      <Select
                        value={field.value?.toString()}
                        onValueChange={(value) => {
                          const recipient = recipients.find((candidate) => candidate.id === Number(value));

                          field.onChange(Number(value));
                          form.setValue('email', recipient?.email ?? '');
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {recipients.map((recipient) => (
                            <SelectItem key={recipient.id} value={recipient.id.toString()}>
                              {recipient.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>
                      <Trans>Email</Trans>
                    </FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" {...field} disabled={!selectedRecipient} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="mt-4">
                <Button type="button" variant="secondary" onClick={() => setIsOpen(false)}>
                  <Trans>Cancel</Trans>
                </Button>
                <Button type="submit" loading={form.formState.isSubmitting}>
                  <Trans>Change email</Trans>
                </Button>
              </DialogFooter>
            </fieldset>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
