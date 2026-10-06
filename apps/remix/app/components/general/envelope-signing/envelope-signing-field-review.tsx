import { fieldsContainUnsignedRequiredField } from '@documenso/lib/utils/advanced-fields-helpers';
import { RecipientRole } from '@prisma/client';
import { type ReactElement, useState } from 'react';

import { EnvelopeFieldReviewDialog } from '~/components/dialogs/envelope-field-review-dialog';

import { useRequiredEnvelopeSigningContext } from '../document-signing/envelope-signing-provider';
import { EnvelopeSignerCompleteDialog } from './envelope-signing-complete-dialog';

export const EnvelopeSigningFieldReview = ({
  buttonClassName,
  trigger,
}: {
  buttonClassName?: string;
  trigger?: ReactElement;
}) => {
  const { recipient, recipientFields, selectedAssistantRecipientFields } = useRequiredEnvelopeSigningContext();
  const [isCompleteOpen, setIsCompleteOpen] = useState(false);
  const canFinalize = recipient.role === RecipientRole.SIGNER && !fieldsContainUnsignedRequiredField(recipientFields);

  return (
    <>
      <EnvelopeFieldReviewDialog
        buttonClassName={buttonClassName}
        trigger={trigger}
        fields={recipient.role === RecipientRole.ASSISTANT ? selectedAssistantRecipientFields : recipient.fields}
        onComplete={canFinalize ? () => setIsCompleteOpen(true) : undefined}
      />
      {recipient.role === RecipientRole.SIGNER && (
        <EnvelopeSignerCompleteDialog open={isCompleteOpen} onOpenChange={setIsCompleteOpen} trigger={null} />
      )}
    </>
  );
};
