import { RecipientRole } from '@prisma/client';
import type { ReactElement } from 'react';

import { EnvelopeFieldReviewDialog } from '~/components/dialogs/envelope-field-review-dialog';

import { useRequiredEnvelopeSigningContext } from '../document-signing/envelope-signing-provider';

export const EnvelopeSigningFieldReview = ({
  buttonClassName,
  trigger,
}: {
  buttonClassName?: string;
  trigger?: ReactElement;
}) => {
  const { recipient, selectedAssistantRecipientFields } = useRequiredEnvelopeSigningContext();

  return (
    <EnvelopeFieldReviewDialog
      buttonClassName={buttonClassName}
      trigger={trigger}
      fields={recipient.role === RecipientRole.ASSISTANT ? selectedAssistantRecipientFields : recipient.fields}
    />
  );
};
