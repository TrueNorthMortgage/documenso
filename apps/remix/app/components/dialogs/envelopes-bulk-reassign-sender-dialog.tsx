import { DO_NOT_INVALIDATE_QUERY_ON_MUTATION } from '@documenso/lib/constants/trpc';
import { AppError } from '@documenso/lib/errors/app-error';
import type { TEnvelope } from '@documenso/lib/types/envelope';
import { getEnvelopeReassignmentSelection } from '@documenso/lib/utils/envelope-reassignment';
import { trpc } from '@documenso/trpc/react';
import { ZReassignEnvelopeSenderRequestSchema } from '@documenso/trpc/server/envelope-router/reassign-envelope-sender.types';
import { Button } from '@documenso/ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@documenso/ui/primitives/dialog';
import { Form, FormField, FormItem, FormLabel, FormMessage } from '@documenso/ui/primitives/form/form';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plural, Trans, useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { useCurrentTeam } from '~/providers/team';

import { ReassignmentMemberCombobox } from '../general/reassignment-member-combobox';

const ZBulkSenderFormSchema = ZReassignEnvelopeSenderRequestSchema.pick({ newOwnerId: true });

type EnvelopesBulkReassignSenderDialogProps = {
  envelopeIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export const EnvelopesBulkReassignSenderDialog = ({
  envelopeIds,
  open,
  onOpenChange,
  onSuccess,
}: EnvelopesBulkReassignSenderDialogProps) => {
  const { t } = useLingui();
  const { toast } = useToast();
  const team = useCurrentTeam();
  const utils = trpc.useUtils();
  const [documents, setDocuments] = useState<TEnvelope[]>([]);
  const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [failures, setFailures] = useState<{ title: string; message: string }[]>([]);
  const [reassignedCount, setReassignedCount] = useState(0);
  const form = useForm<{ newOwnerId: number }>({
    resolver: zodResolver(ZBulkSenderFormSchema),
    defaultValues: { newOwnerId: 0 },
  });
  const { mutateAsync: getEnvelopes } = trpc.envelope.getMany.useMutation(DO_NOT_INVALIDATE_QUERY_ON_MUTATION);
  const { mutateAsync: reassign } = trpc.envelope.bulkReassignSender.useMutation(DO_NOT_INVALIDATE_QUERY_ON_MUTATION);
  const isBusy = form.formState.isSubmitting;
  const newOwnerId = form.watch('newOwnerId');
  const hasTooMany = envelopeIds.length > 100;
  const selectionKey = JSON.stringify(envelopeIds);

  useEffect(() => {
    if (!open) {
      return;
    }
    const selectedIds: string[] = JSON.parse(selectionKey);
    let cancelled = false;
    setDocuments([]);
    setIsLoadingDocuments(false);
    setLoadFailed(false);
    setFailures([]);
    setReassignedCount(0);
    form.reset({ newOwnerId: 0 });
    if (selectedIds.length === 0 || selectedIds.length > 100) {
      return;
    }
    setIsLoadingDocuments(true);
    const loadDocuments = async () => {
      try {
        const loaded: TEnvelope[] = [];
        // The existing read API accepts at most 20 IDs per request.
        for (let index = 0; index < selectedIds.length; index += 20) {
          const result = await getEnvelopes({ ids: { type: 'envelopeId', ids: selectedIds.slice(index, index + 20) } });
          if (cancelled) {
            return;
          }
          loaded.push(...result.data);
        }
        setDocuments(loaded);
      } catch {
        if (!cancelled) {
          setLoadFailed(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDocuments(false);
        }
      }
    };
    void loadDocuments();
    return () => {
      cancelled = true;
    };
  }, [open, selectionKey, getEnvelopes, form]);

  const { eligible, skipped } = getEnvelopeReassignmentSelection(documents, team.id, newOwnerId);
  const skippedCount = envelopeIds.length - reassignedCount - eligible.length;
  const isLoading = isLoadingDocuments;

  const onSubmit = form.handleSubmit(async ({ newOwnerId: targetOwnerId }) => {
    if (isLoading || loadFailed || hasTooMany || eligible.length === 0) {
      return;
    }
    let result: Awaited<ReturnType<typeof reassign>>;
    try {
      result = await reassign({
        newOwnerId: targetOwnerId,
        envelopes: eligible.map((document) => ({ envelopeId: document.id, expectedOwnerId: document.userId })),
      });
    } catch (error) {
      toast({
        title: t`Unable to reassign senders`,
        description: AppError.parseError(error).userMessage || t`Refresh the selection before trying again.`,
        variant: 'destructive',
      });
      // A lost response may still contain committed transfers; reload their current owners before retrying.
      await Promise.all([utils.envelope.invalidate(), utils.document.invalidate(), utils.folder.invalidate()]);
      onSuccess();
      onOpenChange(false);
      return;
    }
    const succeeded = new Set(result.succeededIds);
    const errors = result.failed.map((failure) => ({
      title: eligible.find((document) => document.id === failure.envelopeId)?.title || t`Envelope`,
      message: failure.message,
    }));
    setFailures(errors);
    setReassignedCount((count) => count + succeeded.size);
    setDocuments((current) => current.filter((document) => !succeeded.has(document.id)));
    if (succeeded.size > 0) {
      await Promise.all([utils.envelope.invalidate(), utils.document.invalidate(), utils.folder.invalidate()]);
    }
    if (errors.length === 0) {
      toast({
        title: t`Senders reassigned`,
        description: t`${reassignedCount + succeeded.size} reassigned; ${skippedCount} skipped.`,
      });
      onSuccess();
      onOpenChange(false);
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!isBusy) {
          onOpenChange(value);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Reassign sender</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Choose one active team member to manage the selected envelopes.</Trans>
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit}>
            <fieldset disabled={isBusy} className="space-y-4">
              {hasTooMany && (
                <p role="alert">
                  <Trans>Select no more than 100 envelopes at a time.</Trans>
                </p>
              )}
              {isLoading && (
                <p role="status">
                  <Trans>Loading selected envelopes and team members...</Trans>
                </p>
              )}
              {loadFailed && (
                <p role="alert" className="text-destructive text-sm">
                  <Trans>Unable to load the selection. Close this dialog and try again.</Trans>
                </p>
              )}
              <FormField
                control={form.control}
                name="newOwnerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      <Trans>New sender</Trans>
                    </FormLabel>
                    <ReassignmentMemberCombobox
                      teamId={team.id}
                      value={field.value}
                      onChange={field.onChange}
                      disabled={isLoading || loadFailed || isBusy || hasTooMany}
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!isLoading && !loadFailed && !hasTooMany && (
                <div className="space-y-2 text-sm">
                  <p>
                    <Plural
                      value={eligible.length}
                      one="1 envelope will be reassigned."
                      other="# envelopes will be reassigned."
                    />
                  </p>
                  {skippedCount > 0 && (
                    <p>
                      <Plural
                        value={skippedCount}
                        one="1 selection will be skipped because it is rejected, unavailable, or already has this sender."
                        other="# selections will be skipped because they are rejected, unavailable, or already have this sender."
                      />
                    </p>
                  )}
                  <ul className="max-h-32 list-disc overflow-y-auto pl-5">
                    {eligible.map((document) => (
                      <li key={document.id} className="break-words">
                        {document.title}
                      </li>
                    ))}
                  </ul>
                  {skipped.length > 0 && (
                    <details>
                      <summary>
                        <Trans>Skipped envelopes</Trans>
                      </summary>
                      <ul className="max-h-32 list-disc overflow-y-auto pl-5">
                        {skipped.map((document) => (
                          <li key={document.id} className="break-words">
                            {document.title}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
              <p className="text-sm">
                <Trans>
                  Reassigned envelopes will move to the new sender's Home / Assigned to you folder. The folder will be
                  created if needed, and its existing contents will be kept.
                </Trans>
              </p>
              {eligible.some((document) => document.folderId) && (
                <p className="text-sm">
                  <Trans>Existing folders and their other envelopes will stay where they are.</Trans>
                </p>
              )}
              <p className="text-muted-foreground text-sm">
                <Trans>Existing signatures, signing links, and email settings will be preserved.</Trans>
              </p>
              {reassignedCount > 0 && (
                <p role="status" className="text-sm">
                  <Plural
                    value={reassignedCount}
                    one="1 envelope has been reassigned."
                    other="# envelopes have been reassigned."
                  />
                </p>
              )}
              {failures.length > 0 && (
                <div role="alert" className="text-destructive text-sm">
                  <p>
                    <Trans>These envelopes could not be reassigned. Successful transfers will not be repeated.</Trans>
                  </p>
                  <ul className="max-h-32 list-disc overflow-y-auto pl-5">
                    {failures.map((failure, index) => (
                      <li key={`${failure.title}-${index}`} className="break-words">
                        {failure.title}: {failure.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <DialogFooter>
                <Button type="button" variant="secondary" disabled={isBusy} onClick={() => onOpenChange(false)}>
                  {reassignedCount > 0 ? <Trans>Close</Trans> : <Trans>Cancel</Trans>}
                </Button>
                <Button
                  type="submit"
                  loading={isBusy}
                  disabled={isLoading || loadFailed || hasTooMany || eligible.length === 0 || !newOwnerId}
                >
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
