import pMap from 'p-map';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { Canvas, Image, Path2D } from 'skia-canvas';

import { AppError, AppErrorCode } from '../../errors/app-error';

// @ts-expect-error napi-rs/canvas satisfies the requirements
globalThis.Path2D = Path2D;
// @ts-expect-error napi-rs/canvas satisfies the requirements
globalThis.Image = Image;

class SkiaCanvasFactory {
  _createCanvas(width: number, height: number) {
    const canvas = new Canvas(width, height);
    canvas.gpu = false;

    return canvas;
  }

  create(width: number, height: number) {
    const canvas = this._createCanvas(width, height);

    return {
      canvas,
      context: canvas.getContext('2d'),
    };
  }

  reset(canvasAndContext: { canvas: Canvas }, width: number, height: number) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext: { canvas: Canvas | null; context: unknown }) {
    if (canvasAndContext.canvas) {
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
    }

    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

export type PdfToImagesOptions = {
  scale?: number;
  maxPages?: number;
  maxDimension?: number;
};

export const pdfToImages = async (pdfBytes: Uint8Array, options: PdfToImagesOptions = {}) => {
  const { scale = 2, maxPages, maxDimension } = options;

  const task = pdfjsLib.getDocument({
    data: pdfBytes,
    CanvasFactory: SkiaCanvasFactory,
  });

  try {
    const pdf = await task.promise;

    if (maxPages !== undefined && pdf.numPages > maxPages) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, { userMessage: 'The preview exceeds the page limit.' });
    }

    return await pMap(
      Array.from({ length: pdf.numPages }),
      async (_, index) => {
        const pageNumber = index + 1;
        const page = await pdf.getPage(pageNumber);

        const naturalSize = page.getViewport({ scale: 1 });
        const renderScale = maxDimension
          ? Math.min(scale, maxDimension / Math.max(naturalSize.width, naturalSize.height))
          : scale;
        const viewport = page.getViewport({ scale: renderScale });

        const canvas = new Canvas(viewport.width, viewport.height);
        canvas.gpu = false;

        const canvasContext = canvas.getContext('2d');

        await page.render({
          // @ts-expect-error napi-rs/canvas satifies the requirements
          canvas,
          // @ts-expect-error napi-rs/canvas satifies the requirements
          canvasContext,
          viewport,
        }).promise;

        const result = {
          pageNumber,
          image: await canvas.toBuffer('jpeg'),
          width: Math.floor(viewport.width),
          height: Math.floor(viewport.height),
          pageWidth: naturalSize.width,
          pageHeight: naturalSize.height,
          mimeType: 'image/jpeg',
        };

        void page.cleanup();

        return result;
      },
      { concurrency: 10 },
    );
  } finally {
    await task.destroy().catch(console.error);
  }
};
