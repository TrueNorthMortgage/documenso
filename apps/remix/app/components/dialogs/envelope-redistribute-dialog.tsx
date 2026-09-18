import { getRecipientType } from '@documenso/lib/client-only/recipient-type';
import type { TEnvelope } from '@documenso/lib/types/envelope';
import type { TEnvelopeRecipientLite } from '@documenso/lib/types/recipient';
import { recipientAbbreviation } from '@documenso/lib/utils/recipient-formatter';
import { trpc as trpcReact } from '@documenso/trpc/react';
import { cn } from '@documenso/ui/lib/utils';
import { Button } from '@documenso/ui/primitives/button';
import { Checkbox } from '@documenso/ui/primitives/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@documenso/ui/primitives/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@documenso/ui/primitives/form/form';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { DocumentStatus, EnvelopeType, SigningStatus } from '@prisma/client';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import * as z from 'zod';

import { StackAvatar } from '../general/stack-avatar';

export type EnvelopeRedistributeDialogProps = {
  envelope: Pick<TEnvelope, 'id' | 'userId' | 'teamId' | 'status' | 'type' | 'documentMeta' | 'correctionStartedAt'> & {
    recipients: TEnvelopeRecipientLite[];
  };
  documentRootPath: string;
  trigger?: React.ReactNode;
};

export const ZEnvelopeRedistributeFormSchema = z.object({
  recipients: z.array(z.number()),
});

export type TEnvelopeRedistributeFormSchema = z.infer<typeof ZEnvelopeRedistributeFormSchema>;

export const EnvelopeRedistributeDialog = ({
  envelope,
  documentRootPath,
  trigger,
}: EnvelopeRedistributeDialogProps) => {
  const recipients = envelope.recipients;

  const { toast } = useToast();
  const { t } = useLingui();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);

  const { mutateAsync: redistributeEnvelope } = trpcReact.envelope.redistribute.useMutation();

  const form = useForm<TEnvelopeRedistributeFormSchema>({
    defaultValues: {
      recipients: [],
    },
    resolver: zodResolver(ZEnvelopeRedistributeFormSchema),
  });

  const {
    handleSubmit,
    formState: { isSubmitting },
  } = form;

  const onFormSubmit = async ({ recipients }: TEnvelopeRedistributeFormSchema) => {
    try {
      await redistributeEnvelope({ envelopeId: envelope.id, recipients });

      toast({
        title: envelope.correctionStartedAt ? t`Correction finished` : t`Envelope resent`,
        description: envelope.correctionStartedAt
          ? recipients.length > 0
            ? t`Your corrected envelope is now available and recipients have been notified.`
            : t`Your corrected envelope is now available.`
          : t`Your envelope has been resent successfully.`,
        duration: 5000,
      });

      setIsOpen(false);

      if (envelope.correctionStartedAt) {
        await navigate(`${documentRootPath}/${envelope.id}`);
      }
    } catch (_err) {
      toast({
        title: t`Something went wrong`,
        description: t`This envelope could not be resent at this time. Please try again.`,
        variant: 'destructive',
        duration: 7500,
      });
    }
  };

  useEffect(() => {
    if (!isOpen) {
      form.reset();
    }
  }, [form, isOpen]);

  if (envelope.status !== DocumentStatus.PENDING || envelope.type !== EnvelopeType.DOCUMENT) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="max-w-md" hideClose>
        <DialogHeader>
          <DialogTitle>
            {envelope.correctionStartedAt ? <Trans>Finish Correction</Trans> : <Trans>Resend Document</Trans>}
          </DialogTitle>

          <DialogDescription>
            {envelope.correctionStartedAt ? (
              <Trans>Make the corrected document available. You can optionally notify outstanding recipients.</Trans>
            ) : (
              <Trans>Send reminders to the following recipients</Trans>
            )}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit(onFormSubmit)}>
            <fieldset disabled={isSubmitting}>
              <FormField
                control={form.control}
                name="recipients"
                render={({ field: { value, onChange } }) => (
                  <>
                    {envelope.correctionStartedAt && (
                      <div className="mb-2 px-3">
                        <FormLabel className="font-medium">
                          <Trans>Notify recipients (optional)</Trans>
                        </FormLabel>
                        <p className="text-muted-foreground text-sm">
                          <Trans>Select recipients to email about the corrected envelope.</Trans>
                        </p>
                      </div>
                    )}
                    {recipients
                      .filter((recipient) => recipient.signingStatus === SigningStatus.NOT_SIGNED)
                      .map((recipient) => (
                        <FormItem
                          key={recipient.id}
                          className="flex flex-row items-center justify-between gap-x-3 px-3"
                        >
                          <FormLabel
                            className={cn('my-2 flex items-center gap-2 font-normal', {
                              'opacity-50': !value.includes(recipient.id),
                            })}
                          >
                            <StackAvatar
                              key={recipient.id}
                              type={getRecipientType(recipient)}
                              fallbackText={recipientAbbreviation(recipient)}
                            />
                            {recipient.email}
                          </FormLabel>

                          <FormControl>
                            <Checkbox
                              className="h-5 w-5 rounded-full"
                              value={recipient.id}
                              checked={value.includes(recipient.id)}
                              onCheckedChange={(checked: boolean) =>
                                checked
                                  ? onChange([...value, recipient.id])
                                  : onChange(value.filter((v) => v !== recipient.id))
                              }
                            />
                          </FormControl>
                        </FormItem>
                      ))}
                  </>
                )}
              />

              <DialogFooter className="mt-4">
                <DialogClose asChild>
                  <Button type="button" variant="secondary" disabled={isSubmitting}>
                    <Trans>Cancel</Trans>
                  </Button>
                </DialogClose>

                <Button loading={isSubmitting} type="submit">
                  {envelope.correctionStartedAt ? <Trans>Finish correction</Trans> : <Trans>Send reminder</Trans>}
                </Button>
              </DialogFooter>
            </fieldset>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
