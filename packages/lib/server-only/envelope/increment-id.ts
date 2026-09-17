import { prisma } from '@documenso/prisma';
import type { Prisma } from '@prisma/client';

import { mapDocumentIdToSecondaryId, mapTemplateIdToSecondaryId } from '../../utils/envelope';

export const incrementDocumentId = async (transaction?: Prisma.TransactionClient) => {
  const db = transaction ?? prisma;

  const documentIdCounter = await db.counter.update({
    where: {
      id: 'document',
    },
    data: {
      value: {
        increment: 1,
      },
    },
  });

  return {
    documentId: documentIdCounter.value,
    formattedDocumentId: mapDocumentIdToSecondaryId(documentIdCounter.value),
  };
};

export const incrementTemplateId = async (transaction?: Prisma.TransactionClient) => {
  const db = transaction ?? prisma;

  const templateIdCounter = await db.counter.update({
    where: {
      id: 'template',
    },
    data: {
      value: {
        increment: 1,
      },
    },
  });

  return {
    templateId: templateIdCounter.value,
    formattedTemplateId: mapTemplateIdToSecondaryId(templateIdCounter.value),
  };
};
