import { AppError } from '@documenso/lib/errors/app-error';
import { trpc } from '@documenso/trpc/react';
import { Alert, AlertDescription } from '@documenso/ui/primitives/alert';
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
import { useToast } from '@documenso/ui/primitives/use-toast';
import { Trans, useLingui } from '@lingui/react/macro';
import { AlertTriangleIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { ChangeEnvelopeRecipientEmailDialog } from './change-envelope-recipient-email-dialog';

export type EnvelopeCorrectDialogProps = {
  envelopeId: string;
  documentRootPath: string;
  hasCompletedRecipients: boolean;
  eligibleRecipients?: { id: number; email: string }[];
  trigger: React.ReactNode;
};

export const EnvelopeCorrectDialog = ({
  envelopeId,
  documentRootPath,
  hasCompletedRecipients,
  eligibleRecipients = [],
  trigger,
}: EnvelopeCorrectDialogProps) => {
  const { t } = useLingui();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isChangeEmailOpen, setIsChangeEmailOpen] = useState(false);

  const { mutateAsync: startCorrection, isPending } = trpc.envelope.startCorrection.useMutation();
  const { mutateAsync: createCorrection, isPending: isCreatingCorrection } =
    trpc.envelope.createCorrection.useMutation();

  const onStartCorrection = async () => {
    try {
      const correctedEnvelopeId = hasCompletedRecipients
        ? await createCorrection({ envelopeId }).then((result) => result.id)
        : await startCorrection({ envelopeId }).then(() => envelopeId);

      setIsOpen(false);
      await navigate(`${documentRootPath}/${correctedEnvelopeId}/edit`);
    } catch (err) {
      const error = AppError.parseError(err);

      toast({
        title: t`Something went wrong`,
        description: error.userMessage || t`The document could not be opened for correction. Please try again.`,
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>

        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              <Trans>Correct Document</Trans>
            </DialogTitle>
            <DialogDescription>
              {hasCompletedRecipients ? (
                <Trans>This document cannot be changed in place because a recipient has completed their action.</Trans>
              ) : (
                <Trans>Recipients will be temporarily unable to access this document while you make corrections.</Trans>
              )}
            </DialogDescription>
          </DialogHeader>

          {hasCompletedRecipients ? (
            <Alert variant="warning">
              <AlertTriangleIcon className="h-4 w-4" />
              <AlertDescription>
                <Trans>
                  One or more recipients have completed their action. Continuing will cancel the original document and
                  create a new draft copy. All recipients must complete the corrected document again and will receive
                  new signing links when you send it. Your normal cancellation notification settings apply to the
                  original.
                </Trans>
              </AlertDescription>
            </Alert>
          ) : (
            <p className="text-muted-foreground text-sm">
              <Trans>
                Existing signing links will continue to work after you finish. Outstanding recipients will be notified
                when the corrected document is ready.
              </Trans>
            </p>
          )}

          <DialogFooter>
            {hasCompletedRecipients && eligibleRecipients.length > 0 && (
              <Button
                type="button"
                variant="outline"
                disabled={isPending || isCreatingCorrection}
                onClick={() => {
                  setIsOpen(false);
                  setIsChangeEmailOpen(true);
                }}
              >
                <Trans>Only update email addresses</Trans>
              </Button>
            )}
            <DialogClose asChild>
              <Button type="button" variant="secondary" disabled={isPending || isCreatingCorrection}>
                <Trans>Cancel</Trans>
              </Button>
            </DialogClose>

            <Button
              type="button"
              variant={hasCompletedRecipients ? 'destructive' : 'default'}
              loading={isPending || isCreatingCorrection}
              onClick={() => void onStartCorrection()}
            >
              {hasCompletedRecipients ? <Trans>Cancel and create copy</Trans> : <Trans>Start correction</Trans>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ChangeEnvelopeRecipientEmailDialog
        envelopeId={envelopeId}
        recipients={eligibleRecipients}
        open={isChangeEmailOpen}
        onOpenChange={setIsChangeEmailOpen}
      />
    </>
  );
};
