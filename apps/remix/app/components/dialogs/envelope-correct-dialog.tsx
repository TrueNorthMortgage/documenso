import { AppError } from '@documenso/lib/errors/app-error';
import { trpc } from '@documenso/trpc/react';
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
import { useState } from 'react';
import { useNavigate } from 'react-router';

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

  const { mutateAsync: startCorrection, isPending } = trpc.envelope.startCorrection.useMutation();

  const onStartCorrection = async () => {
    try {
      await startCorrection({ envelopeId });

      setIsOpen(false);
      await navigate(`${documentRootPath}/${envelopeId}/edit`);
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
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            <Trans>Correct Document</Trans>
          </DialogTitle>
          <DialogDescription>
            {hasCompletedRecipients ? (
              <Trans>Some recipients have completed their action, so only limited corrections are available.</Trans>
            ) : (
              <Trans>Recipients will be temporarily unable to access this document while you make corrections.</Trans>
            )}
          </DialogDescription>
        </DialogHeader>

        {hasCompletedRecipients ? (
          <p className="text-muted-foreground text-sm">
            <Trans>
              Completed recipients, their fields, and all documents are locked. You can update recipients who have not
              signed yet and add, move, edit, or remove their fields.
            </Trans>
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            <Trans>
              Existing signing links will continue to work after you finish. Outstanding recipients will be notified
              when the corrected document is ready.
            </Trans>
          </p>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary" disabled={isPending}>
              <Trans>Cancel</Trans>
            </Button>
          </DialogClose>

          <Button type="button" loading={isPending} onClick={() => void onStartCorrection()}>
            <Trans>Start correction</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
