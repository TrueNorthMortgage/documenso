import { Button } from '@documenso/ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@documenso/ui/primitives/dialog';
import { Trans } from '@lingui/react/macro';
import type { ReactNode } from 'react';

import { EnvelopeEditorRecipientForm } from './envelope-editor-recipient-form';

type EnvelopeEditorRecipientsDialogProps = {
  trigger?: ReactNode;
};

export const EnvelopeEditorRecipientsDialog = ({ trigger }: EnvelopeEditorRecipientsDialogProps) => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="outline">
            <Trans>Manage recipients</Trans>
          </Button>
        )}
      </DialogTrigger>

      <DialogContent position="center" className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            <Trans>Manage recipients</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Add or update the people who need to complete this document.</Trans>
          </DialogDescription>
        </DialogHeader>

        <EnvelopeEditorRecipientForm />
      </DialogContent>
    </Dialog>
  );
};
