import { prisma } from '@documenso/prisma';
import { SigningStatus } from '@prisma/client';

import { getConditionalFieldVisibility } from '../../universal/conditional-field-visibility';
import { mapDocumentIdToSecondaryId } from '../../utils/envelope';

export type GetCompletedFieldsForDocumentOptions = {
  documentId: number;
};

export const getCompletedFieldsForDocument = async ({ documentId }: GetCompletedFieldsForDocumentOptions) => {
  const envelope = await prisma.envelope.findFirst({
    where: {
      secondaryId: mapDocumentIdToSecondaryId(documentId),
    },
    select: {
      internalVersion: true,
    },
  });

  if (!envelope) {
    return [];
  }

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

  const fieldsWithVersion = fields.map((field) => ({
    ...field,
    envelopeInternalVersion: envelope.internalVersion,
  }));
  const visibility = getConditionalFieldVisibility(fieldsWithVersion);

  return fieldsWithVersion.filter((field) => visibility.get(field.id) ?? true);
};
