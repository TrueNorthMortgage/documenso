import { RecipientRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { getRecipientsWithInvalidEmails } from './recipients';

describe('getRecipientsWithInvalidEmails', () => {
  it('returns non-CC recipients without valid email addresses', () => {
    const invalidRecipients = getRecipientsWithInvalidEmails([
      { id: 1, role: RecipientRole.SIGNER, email: '' },
      { id: 2, role: RecipientRole.VIEWER, email: 'not-an-email' },
      { id: 3, role: RecipientRole.SIGNER, email: 'signer@example.com' },
    ]);

    expect(invalidRecipients.map((recipient) => recipient.id)).toEqual([1, 2]);
  });

  it('does not require an email for CC recipients', () => {
    expect(getRecipientsWithInvalidEmails([{ id: 1, role: RecipientRole.CC, email: '' }])).toEqual([]);
  });
});
