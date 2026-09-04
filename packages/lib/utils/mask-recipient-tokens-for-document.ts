import type { EnvelopeWithRecipients } from '@documenso/prisma/types/document-with-recipient';
import type { User } from '@prisma/client';
import { TeamMemberRole } from '@prisma/client';

export type MaskRecipientTokensForDocumentOptions<T extends EnvelopeWithRecipients> = {
  document: T;
  user?: Pick<User, 'id' | 'email'>;
  token?: string;
  currentTeamRole?: TeamMemberRole;
};

export const maskRecipientTokensForDocument = <T extends EnvelopeWithRecipients>({
  document,
  user,
  token,
  currentTeamRole,
}: MaskRecipientTokensForDocumentOptions<T>) => {
  const maskedRecipients = document.recipients.map((recipient) => {
    if (currentTeamRole === TeamMemberRole.ADMIN || currentTeamRole === TeamMemberRole.MANAGER) {
      return recipient;
    }

    if (recipient.email === user?.email) {
      return recipient;
    }

    if (recipient.token === token) {
      return recipient;
    }

    return {
      ...recipient,
      token: '',
    };
  });

  return {
    ...document,
    recipients: maskedRecipients,
  };
};
