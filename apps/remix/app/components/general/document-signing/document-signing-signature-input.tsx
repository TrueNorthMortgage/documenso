import type { SignatureFontFamily } from '@documenso/lib/constants/signatures';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import type { TRecipientActionAuth } from '@documenso/lib/types/document-auth';
import {
  SignaturePadDialog,
  type SignaturePadDialogProps,
} from '@documenso/ui/primitives/signature-pad/signature-pad-dialog';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { useLingui } from '@lingui/react/macro';
import { FieldType } from '@prisma/client';

import { useRequiredDocumentSigningAuthContext } from './document-signing-auth-provider';

type DocumentSigningSignatureInputProps = Omit<
  SignaturePadDialogProps,
  'onChange' | 'onSignatureFontChange' | 'onConfirm'
> & {
  hasFilledFields: boolean;
  onUpdate: (value: string, font: SignatureFontFamily | null, authOptions?: TRecipientActionAuth) => Promise<void>;
};

export const DocumentSigningSignatureInput = ({
  hasFilledFields,
  onUpdate,
  ...props
}: DocumentSigningSignatureInputProps) => {
  const { executeActionAuthProcedure } = useRequiredDocumentSigningAuthContext();
  const { toast } = useToast();
  const { t } = useLingui();

  const showError = () =>
    toast({
      title: t`Error`,
      description: t`An error occurred while signing the document.`,
      variant: 'destructive',
    });

  const confirm = (value: string, font: SignatureFontFamily | null) => {
    const update = async (authOptions?: TRecipientActionAuth) => {
      try {
        await onUpdate(value, font, authOptions);
      } catch (error) {
        if (AppError.parseError(error).code === AppErrorCode.UNAUTHORIZED) {
          throw error;
        }

        showError();
      }
    };

    if (!hasFilledFields) {
      void update().catch(showError);
      return;
    }

    void executeActionAuthProcedure({ actionTarget: FieldType.SIGNATURE, onReauthFormSubmit: update }).catch(showError);
  };

  return <SignaturePadDialog {...props} onChange={() => {}} onConfirm={confirm} />;
};
