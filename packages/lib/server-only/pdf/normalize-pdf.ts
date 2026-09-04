import { PDF, PdfDict, PdfRef } from '@libpdf/core';

import { AppError } from '../../errors/app-error';

const removeWidgetAnnotations = (pdfDoc: PDF) => {
  for (const page of pdfDoc.getPages()) {
    const annotations = page.dict.getArray('Annots');

    if (!annotations) {
      continue;
    }

    for (let index = annotations.length - 1; index >= 0; index--) {
      const annotation = annotations.at(index);
      const annotationDict = annotation instanceof PdfRef ? pdfDoc.getObject(annotation) : annotation;

      if (annotationDict instanceof PdfDict && annotationDict.getName('Subtype')?.value === 'Widget') {
        annotations.remove(index);
      }
    }

    if (annotations.length === 0) {
      page.dict.delete('Annots');
    }
  }
};

export const normalizePdf = async (pdf: Buffer, options: { flattenForm?: boolean } = {}) => {
  const shouldFlattenForm = options.flattenForm ?? true;

  const pdfDoc = await PDF.load(pdf).catch((e) => {
    console.error(`PDF normalization error: ${e.message}`);

    throw new AppError('INVALID_DOCUMENT_FILE', {
      message: 'The document is not a valid PDF',
    });
  });

  if (pdfDoc.isEncrypted) {
    throw new AppError('INVALID_DOCUMENT_FILE', {
      message: 'The document is encrypted',
    });
  }

  pdfDoc.flattenLayers();

  const form = pdfDoc.getForm();

  if (shouldFlattenForm && form) {
    form.flatten();
    pdfDoc.flattenAnnotations();
    removeWidgetAnnotations(pdfDoc);
  }

  const normalizedPdfBytes = await pdfDoc.save();

  return Buffer.from(normalizedPdfBytes);
};
