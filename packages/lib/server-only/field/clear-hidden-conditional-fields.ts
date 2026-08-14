import type { Prisma } from '@prisma/client';

import { getHiddenConditionalFieldIds } from '../../universal/conditional-field-visibility';

export const clearHiddenConditionalFields = async ({
  tx,
  envelopeItemId,
}: {
  tx: Prisma.TransactionClient;
  envelopeItemId: string;
}) => {
  const fields = await tx.field.findMany({
    where: {
      envelopeItemId,
    },
    include: {
      conditionalChildRule: true,
    },
  });

  const hiddenFieldIds = getHiddenConditionalFieldIds(fields);

  if (hiddenFieldIds.length === 0) {
    return [];
  }

  await tx.field.updateMany({
    where: {
      id: {
        in: hiddenFieldIds,
      },
    },
    data: {
      customText: '',
      inserted: false,
    },
  });

  await tx.signature.deleteMany({
    where: {
      fieldId: {
        in: hiddenFieldIds,
      },
    },
  });

  return hiddenFieldIds;
};
