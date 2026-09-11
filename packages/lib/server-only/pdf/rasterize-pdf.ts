import { PDF } from '@libpdf/core';

import { pdfToImages } from '../ai/pdf-to-images';

const RASTER_SCALE = 2;

/**
 * Rebuild a PDF from rendered page images so that the original PDF's fonts and
 * interactive content cannot be lost when the document is saved again.
 */
export const rasterizePdf = async (pdf: Buffer) => {
  const pageImages = await pdfToImages(new Uint8Array(pdf), { scale: RASTER_SCALE });
  const rasterizedPdf = PDF.create();

  for (const pageImage of pageImages) {
    const page = rasterizedPdf.addPage({
      width: pageImage.pageWidth,
      height: pageImage.pageHeight,
    });
    const image = rasterizedPdf.embedJpeg(pageImage.image);

    page.drawImage(image, {
      x: 0,
      y: 0,
      width: pageImage.pageWidth,
      height: pageImage.pageHeight,
    });
  }

  return Buffer.from(await rasterizedPdf.save());
};
