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
import { useToast } from '@documenso/ui/primitives/use-toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { PencilIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRevalidator } from 'react-router';
import { z } from 'zod';

const ZChangeEnvelopeRecipientEmailFormSchema = z.object({
  email: zEmail('Enter a valid email address.').trim().toLowerCase().max(254),
});

type TChangeEnvelopeRecipientEmailFormSchema = z.infer<typeof ZChangeEnvelopeRecipientEmailFormSchema>;

export type ChangeEnvelopeRecipientEmailDialogProps = {
  envelopeId: string;
  recipient: {
    id: number;
    email: string;
  };
};

export const ChangeEnvelopeRecipientEmailDialog = ({
  envelopeId,
  recipient,
}: ChangeEnvelopeRecipientEmailDialogProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useLingui();
  const { toast } = useToast();
  const { revalidate } = useRevalidator();

  const form = useForm<TChangeEnvelopeRecipientEmailFormSchema>({
    resolver: zodResolver(ZChangeEnvelopeRecipientEmailFormSchema),
    defaultValues: {
      email: recipient.email,
    },
  });

  const { mutateAsync: changeRecipientEmail } = trpc.envelope.recipient.changeEmail.useMutation();

  const onFormSubmit = async ({ email }: TChangeEnvelopeRecipientEmailFormSchema) => {
    try {
      await changeRecipientEmail({
        envelopeId,
        recipientId: recipient.id,
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
      form.reset({ email: recipient.email });
    }
  }, [form, isOpen, recipient.email]);

  return (
    <Dialog open={isOpen} onOpenChange={(value) => !form.formState.isSubmitting && setIsOpen(value)}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="ml-2 h-7 px-2">
          <PencilIcon className="mr-1 h-3 w-3" />
          <Trans>Change email</Trans>
        </Button>
      </DialogTrigger>

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
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>
                      <Trans>Email</Trans>
                    </FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" {...field} />
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
