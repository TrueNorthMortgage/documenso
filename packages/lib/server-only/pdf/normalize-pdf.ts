import { PDF, PdfDict, PdfRef } from '@libpdf/core';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { rasterizePdf } from './rasterize-pdf';

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

export const normalizePdf = async (pdf: Buffer, options: { flattenForm?: boolean; rasterize?: boolean } = {}) => {
  const shouldFlattenForm = options.flattenForm ?? true;
  const shouldRasterize = options.rasterize ?? true;

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

  const acroForm = pdfDoc.getCatalog().getDict('AcroForm', (ref) => pdfDoc.getObject(ref));

  if (acroForm?.has('XFA')) {
    throw new AppError(AppErrorCode.UNSUPPORTED_XFA_PDF, {
      message: 'XFA-based PDF forms are not supported',
      userMessage:
        'This PDF uses an XFA form, which Documenso cannot display reliably. Open it in Adobe Acrobat, print it to a new PDF, then upload that copy.',
      statusCode: 400,
    });
  }

  if (shouldRasterize) {
    try {
      return await rasterizePdf(pdf);
    } catch (e) {
      console.error(`PDF rasterization error: ${e instanceof Error ? e.message : String(e)}`);

      throw new AppError('INVALID_DOCUMENT_FILE', {
        message: 'The document is not a valid PDF',
      });
    }
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
