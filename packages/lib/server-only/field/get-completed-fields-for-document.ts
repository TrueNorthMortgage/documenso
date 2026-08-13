import { prisma } from '@documenso/prisma';
import { SigningStatus } from '@prisma/client';

import { getConditionalFieldVisibility } from '../../universal/conditional-field-visibility';
import { mapDocumentIdToSecondaryId } from '../../utils/envelope';

export type GetCompletedFieldsForDocumentOptions = {
  documentId: number;
};

export const getCompletedFieldsForDocument = async ({ documentId }: GetCompletedFieldsForDocumentOptions) => {
  const fields = await prisma.field.findMany({
    where: {
      envelope: {
        secondaryId: mapDocumentIdToSecondaryId(documentId),
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
        },
      },
    },
  });

  const visibility = getConditionalFieldVisibility(fields);

  return fields.filter((field) => visibility.get(field.id) ?? true);
};
