import { prisma } from '@documenso/prisma';
import { EnvelopeType, SigningStatus } from '@prisma/client';

import { getConditionalFieldVisibility } from '../../universal/conditional-field-visibility';

export type GetCompletedFieldsForTokenOptions = {
  token: string;
};

// Note: You many need to filter this on a per envelope item ID basis.
export const getCompletedFieldsForToken = async ({ token }: GetCompletedFieldsForTokenOptions) => {
  const recipient = await prisma.recipient.findFirst({
    where: {
      token,
    },
    select: {
      envelope: {
        select: {
          internalVersion: true,
        },
      },
    },
  });

  if (!recipient) {
    return [];
  }

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

  const fieldsWithVersion = fields.map((field) => ({
    ...field,
    envelopeInternalVersion: recipient.envelope.internalVersion,
  }));
  const visibility = getConditionalFieldVisibility(fieldsWithVersion);

  return fieldsWithVersion.filter((field) => visibility.get(field.id) ?? true);
};
