import { RecipientRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { resolveTemplateRecipient } from './apply-template-to-envelope-item';

describe('resolveTemplateRecipient', () => {
  it('matches recipients by role and signing order', () => {
    const recipient = resolveTemplateRecipient({
      templateRecipient: {
        id: 1,
        role: RecipientRole.SIGNER,
        signingOrder: 2,
      },
      recipients: [
        { id: 10, role: RecipientRole.SIGNER, signingOrder: 1 },
        { id: 20, role: RecipientRole.SIGNER, signingOrder: 2 },
      ],
    });

    expect(recipient.id).toBe(20);
  });

  it('rejects ambiguous role matches', () => {
    expect(() =>
      resolveTemplateRecipient({
        templateRecipient: {
          id: 1,
          role: RecipientRole.SIGNER,
          signingOrder: null,
        },
        recipients: [
          { id: 10, role: RecipientRole.SIGNER, signingOrder: null },
          { id: 20, role: RecipientRole.SIGNER, signingOrder: null },
        ],
      }),
    ).toThrow('Could not uniquely map template recipient');
  });
});
