import type { EnvelopeWithRecipients } from '@documenso/prisma/types/document-with-recipient';
import { RecipientRole, TeamMemberRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { maskRecipientTokensForDocument } from './mask-recipient-tokens-for-document';

const document = {
  userId: 1,
  recipients: [
    { id: 1, email: 'owner@example.com', token: 'owner-token', role: RecipientRole.SIGNER },
    { id: 2, email: 'recipient@example.com', token: 'recipient-token', role: RecipientRole.SIGNER },
  ],
} as EnvelopeWithRecipients;

describe('maskRecipientTokensForDocument', () => {
  it('keeps all recipient tokens for managers and admins', () => {
    for (const currentTeamRole of [TeamMemberRole.MANAGER, TeamMemberRole.ADMIN]) {
      const result = maskRecipientTokensForDocument({
        document,
        user: { id: 3, email: 'member@example.com' },
        currentTeamRole,
      });

      expect(result.recipients.map((recipient) => recipient.token)).toEqual(['owner-token', 'recipient-token']);
    }
  });

  it('keeps only the current user token for regular members', () => {
    const result = maskRecipientTokensForDocument({
      document,
      user: { id: 1, email: 'owner@example.com' },
      currentTeamRole: TeamMemberRole.MEMBER,
    });

    expect(result.recipients.map((recipient) => recipient.token)).toEqual(['owner-token', '']);
  });
});
