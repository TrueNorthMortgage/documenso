import { prisma } from '@documenso/prisma';
import { EnvelopeType, SigningStatus } from '@prisma/client';

import { getConditionalFieldVisibility } from '../../universal/conditional-field-visibility';

export type GetCompletedFieldsForTokenOptions = {
  token: string;
};

// Note: You many need to filter this on a per envelope item ID basis.
export const getCompletedFieldsForToken = async ({ token }: GetCompletedFieldsForTokenOptions) => {
  const fields = await prisma.field.findMany({
    where: {
      envelope: {
        type: EnvelopeType.DOCUMENT,
        recipients: {
          some: {
            token,
          },
        },
      },
      recipient: {
        signingStatus: SigningStatus.SIGNED,
      },
      inserted: true,
    },
    include: {
      conditionalChildRule: true,
      signature: true,
      recipient: {
        select: {
          name: true,
          email: true,
          signingStatus: true,
        },
      },
    },
  });

  const visibility = getConditionalFieldVisibility(fields);

  return fields.filter((field) => visibility.get(field.id) ?? true);
};
