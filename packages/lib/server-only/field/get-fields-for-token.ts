import { prisma } from '@documenso/prisma';
import { EnvelopeType, FieldType, RecipientRole, SigningStatus } from '@prisma/client';

import { getConditionalFieldVisibility } from '../../universal/conditional-field-visibility';

export type GetFieldsForTokenOptions = {
  token: string;
};

// Note: You many need to filter this on a per envelope item ID basis.
export const getFieldsForToken = async ({ token }: GetFieldsForTokenOptions) => {
  if (!token) {
    throw new Error('Missing token');
  }

  const recipient = await prisma.recipient.findFirst({
    where: { token },
  });

  if (!recipient) {
    return [];
  }

  if (recipient.role === RecipientRole.ASSISTANT) {
    const fields = await prisma.field.findMany({
      where: {
        OR: [
          {
            type: {
              not: FieldType.SIGNATURE,
            },
            recipient: {
              signingStatus: {
                not: SigningStatus.SIGNED,
              },
              signingOrder: {
                gte: recipient.signingOrder ?? 0,
              },
              envelopeId: recipient.envelopeId,
            },
            envelope: {
              id: recipient.envelopeId,
              type: EnvelopeType.DOCUMENT,
            },
          },
          {
            recipientId: recipient.id,
          },
        ],
      },
      include: {
        conditionalChildRule: true,
        signature: true,
      },
    });

    const visibility = getConditionalFieldVisibility(fields);

    return fields.filter((field) => visibility.get(field.id) ?? true);
  }

  const fields = await prisma.field.findMany({
    where: {
      recipientId: recipient.id,
    },
    include: {
      conditionalChildRule: true,
      signature: true,
    },
  });

  const visibility = getConditionalFieldVisibility(fields);

  return fields.filter((field) => visibility.get(field.id) ?? true);
};
