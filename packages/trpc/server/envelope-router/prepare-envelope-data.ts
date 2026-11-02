import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { convertToPdf } from '@documenso/lib/server-only/document-conversion';
import { extractPdfPlaceholders } from '@documenso/lib/server-only/pdf/auto-place-fields';
import { normalizePdf } from '@documenso/lib/server-only/pdf/normalize-pdf';
import { PDF } from '@libpdf/core';
import type { Logger } from 'pino';

import { mapEnvelopeRecipients } from '../../../lib/server-only/envelope/map-envelope-recipients';
import { insertFormValuesInPdf } from '../../../lib/server-only/pdf/insert-form-values-in-pdf';
import { putPdfFileServerSide } from '../../../lib/universal/upload/put-file.server';
import type { TCreateEnvelopePayload, TCreateEnvelopeRequest } from './create-envelope.types';

export const prepareEnvelopeData = async ({
  payload,
  files,
  logger,
}: {
  payload: TCreateEnvelopePayload;
  files: TCreateEnvelopeRequest['files'];
  logger?: Logger;
}) => {
  if (payload.documentShapes?.some((entry) => entry.identifier >= files.length)) {
    throw new AppError(AppErrorCode.INVALID_BODY, { message: 'Shape document index does not exist' });
  }
  const envelopeItems = await Promise.all(
    files.map(async (file, index) => {
      let pdf = await convertToPdf(file, logger);

      if (payload.formValues) {
        pdf = await insertFormValuesInPdf({
          pdf,
          formValues: payload.formValues,
        });
      }

      const normalized = await normalizePdf(pdf, {
        flattenForm: payload.type !== 'TEMPLATE',
      });
      const { cleanedPdf, placeholders } = await extractPdfPlaceholders(normalized, { sourcePdf: pdf });
      const shapes = payload.documentShapes?.find((entry) => entry.identifier === index)?.shapes ?? [];
      if (shapes.length > 0) {
        const shapePdf = await PDF.load(cleanedPdf);
        if (shapes.some((shape) => shape.page > shapePdf.getPageCount())) {
          throw new AppError(AppErrorCode.INVALID_BODY, { message: 'Shape page does not exist' });
        }
      }
      const { documentData } = await putPdfFileServerSide({
        name: file.name,
        type: 'application/pdf',
        arrayBuffer: async () => Promise.resolve(cleanedPdf),
      });

      return {
        title: file.name,
        documentDataId: documentData.id,
        placeholders,
        shapes,
      };
    }),
  );

  return {
    envelopeItems,
    recipients: mapEnvelopeRecipients(payload.recipients, envelopeItems),
  };
};
