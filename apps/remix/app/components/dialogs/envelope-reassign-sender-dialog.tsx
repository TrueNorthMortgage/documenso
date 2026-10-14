import { AppError } from '@documenso/lib/errors/app-error';
import { formatDocumentsPath } from '@documenso/lib/utils/teams';
import { trpc } from '@documenso/trpc/react';
import { ZReassignEnvelopeSenderRequestSchema } from '@documenso/trpc/server/envelope-router/reassign-envelope-sender.types';
import { Button } from '@documenso/ui/primitives/button';
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@documenso/ui/primitives/form/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@documenso/ui/primitives/select';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import type { z } from 'zod';

import { useCurrentTeam } from '~/providers/team';

type EnvelopeReassignSenderDialogProps = {
  envelopeId: string;
  currentOwner: { id: number; name?: string | null; email: string };
  hasFolder: boolean;
  trigger: React.ReactNode;
  onBeforeReassign?: () => Promise<unknown>;
};

export const EnvelopeReassignSenderDialog = ({
  envelopeId,
  currentOwner,
  hasFolder,
  trigger,
  onBeforeReassign,
}: EnvelopeReassignSenderDialogProps) => {
  const [open, setOpen] = useState(false);
  const { t } = useLingui();
  const { toast } = useToast();
  const team = useCurrentTeam();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const form = useForm<z.infer<typeof ZReassignEnvelopeSenderRequestSchema>>({
    resolver: zodResolver(ZReassignEnvelopeSenderRequestSchema),
    defaultValues: { envelopeId, expectedOwnerId: currentOwner.id, newOwnerId: 0 },
  });
  const {
    data: members,
    isLoading,
    isError,
  } = trpc.envelope.reassignmentCandidates.useQuery({ teamId: team.id }, { enabled: open });
  const candidates = members?.filter((member) => member.id !== currentOwner.id) ?? [];
  const { mutateAsync, isPending } = trpc.envelope.reassignSender.useMutation();
  const isBusy = isPending || form.formState.isSubmitting;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await onBeforeReassign?.();
      await mutateAsync(values);
    } catch (err) {
      const error = AppError.parseError(err);
      toast({
        title: t`Reassignment failed`,
        description: error.userMessage || t`The sender could not be reassigned. Please try again.`,
        variant: 'destructive',
      });
      return;
    }

    setOpen(false);
    toast({ title: t`Sender reassigned`, description: t`The envelope is now managed by the new sender.` });
    await Promise.all([utils.envelope.invalidate(), utils.document.invalidate(), utils.folder.invalidate()]);
    await navigate(formatDocumentsPath(team.url));
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!isBusy) {
          setOpen(value);
          if (value) {
            form.reset({ envelopeId, expectedOwnerId: currentOwner.id, newOwnerId: 0 });
          }
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Reassign sender</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Transfer this envelope to another active member of this team.</Trans>
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit}>
            <fieldset disabled={isBusy} className="space-y-4">
              <p className="break-words text-sm">
                <Trans>Current sender:</Trans> {currentOwner.name || currentOwner.email}
              </p>
              <FormField
                control={form.control}
                name="newOwnerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <Trans>New sender</Trans>
                    </FormLabel>
                    <Select
                      value={field.value ? String(field.value) : undefined}
                      onValueChange={(value) => field.onChange(Number(value))}
                      disabled={isLoading || isError || isBusy}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t`Select a team member`} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {candidates.map((member) => (
                          <SelectItem key={member.id} value={String(member.id)}>
                            {member.name ? `${member.name} (${member.email})` : member.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {isError && (
                <p role="alert" className="text-destructive text-sm">
                  <Trans>Unable to load team members. Close this dialog and try again.</Trans>
                </p>
              )}
              {!isLoading && !isError && candidates.length === 0 && (
                <p className="text-sm">
                  <Trans>No other active team members are available.</Trans>
                </p>
              )}
              <p className="text-sm">
                <Trans>
                  This envelope will move to the new sender's Home / Assigned to you folder. The folder will be created
                  if needed, and its existing contents will be kept.
                </Trans>
              </p>
              {hasFolder && (
                <p className="text-sm">
                  <Trans>Its current folder and other envelopes will stay where they are.</Trans>
                </p>
              )}
              <p className="text-muted-foreground text-sm">
                <Trans>Existing signatures, signing links, and email settings will be preserved.</Trans>
              </p>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="secondary" disabled={isBusy}>
                    <Trans>Cancel</Trans>
                  </Button>
                </DialogClose>
                <Button type="submit" loading={isBusy} disabled={isLoading || isError || !form.watch('newOwnerId')}>
                  <Trans>Reassign sender</Trans>
                </Button>
              </DialogFooter>
            </fieldset>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
