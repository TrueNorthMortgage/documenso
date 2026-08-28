import { getFileServerSide } from '@documenso/lib/universal/upload/get-file.server';
import { PDF } from '@libpdf/core';
import type { DocumentDataType } from '@prisma/client';

import { getLocalPdfFixture } from './local-pdf-fixture';

type EnvelopeItemWithDocumentData = {
  id: string;
  documentData: {
    type: DocumentDataType;
    data: string;
  };
};

export const getEnvelopeItemPageCounts = async (envelopeItems: EnvelopeItemWithDocumentData[]) => {
  const pageCounts = await Promise.all(
    envelopeItems.map(async (envelopeItem) => {
      const localPdfFixture = await getLocalPdfFixture();
      const file =
        localPdfFixture?.data ??
        (await getFileServerSide({
          type: envelopeItem.documentData.type,
          data: envelopeItem.documentData.data,
        }));
      const pdf = await PDF.load(file);

      return [envelopeItem.id, pdf.getPageCount()] as const;
    }),
  );

  return new Map(pageCounts);
};
