import { RecipientRole } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@documenso/prisma', () => ({ prisma: {} }));

import {
  createTemplateFieldGroups,
  resolveTemplateRecipient,
  resolveTemplateRecipients,
} from './apply-template-to-envelope-item';

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

describe('resolveTemplateRecipients', () => {
  it('maps unique matches and reports missing recipients for creation', () => {
    const result = resolveTemplateRecipients({
      templateRecipients: [
        { id: 1, role: RecipientRole.SIGNER, signingOrder: 1 },
        { id: 2, role: RecipientRole.SIGNER, signingOrder: 2 },
      ],
      recipients: [{ id: 10, role: RecipientRole.SIGNER, signingOrder: 1 }],
    });

    expect(result.recipientMap).toEqual(new Map([[1, 10]]));
    expect(result.unmappedTemplateRecipientIds).toEqual([2]);
  });

  it('does not reuse one recipient for multiple template recipients', () => {
    const result = resolveTemplateRecipients({
      templateRecipients: [
        { id: 1, role: RecipientRole.SIGNER, signingOrder: null },
        { id: 2, role: RecipientRole.SIGNER, signingOrder: null },
      ],
      recipients: [{ id: 10, role: RecipientRole.SIGNER, signingOrder: null }],
    });

    expect(result.recipientMap).toEqual(new Map([[1, 10]]));
    expect(result.unmappedTemplateRecipientIds).toEqual([2]);
  });

  it('rejects ambiguous existing matches', () => {
    expect(() =>
      resolveTemplateRecipients({
        templateRecipients: [{ id: 1, role: RecipientRole.SIGNER, signingOrder: null }],
        recipients: [
          { id: 10, role: RecipientRole.SIGNER, signingOrder: null },
          { id: 20, role: RecipientRole.SIGNER, signingOrder: null },
        ],
      }),
    ).toThrow('Could not uniquely map template recipient');
  });
});

describe('createTemplateFieldGroups', () => {
  it('copies validation groups and returns IDs for copied fields', async () => {
    const tx = {
      fieldGroup: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const fieldGroupIdMap = await createTemplateFieldGroups({
      tx: tx as never,
      envelopeId: 'envelope_1',
      envelopeItemId: 'envelope_item_1',
      sourceFields: [
        {
          fieldGroupId: 'template_group_1',
          fieldGroup: {
            id: 'template_group_1',
            name: 'Initials',
            type: 'INITIALS',
            groupType: 'VALIDATION_GROUP',
            required: false,
            readOnly: false,
            fontSize: null,
            direction: null,
            validationRule: 'Select exactly',
            validationLength: 1,
            envelopeItemId: 'template_item_1',
            recipientId: 1,
          },
        },
      ],
      recipientMap: new Map([[1, 10]]),
    });

    expect(fieldGroupIdMap.get('template_group_1')).toEqual(expect.any(String));
    expect(tx.fieldGroup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Initials',
        groupType: 'VALIDATION_GROUP',
        validationRule: 'Select exactly',
        validationLength: 1,
        envelopeId: 'envelope_1',
        envelopeItemId: 'envelope_item_1',
        recipientId: 10,
      }),
    });
  });
});
