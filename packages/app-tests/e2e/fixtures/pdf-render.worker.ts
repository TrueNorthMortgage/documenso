import { parentPort, workerData } from 'node:worker_threads';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const renderPdfToImage = async (data: Uint8Array) => {
  const pdf = await getDocument({ data }).promise;

  try {
    const images = [];
    // Render sequentially to avoid holding all high-resolution canvases at once.
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 4 });
      const canvas = createCanvas(viewport.width, viewport.height);
      const canvasContext = canvas.getContext('2d');
      canvasContext.imageSmoothingEnabled = false;

      await page.render({
        // @ts-expect-error The native canvas implements PDF.js runtime requirements.
        canvas,
        // @ts-expect-error The native context implements PDF.js runtime requirements.
        canvasContext,
        viewport,
      }).promise;

      images.push({
        image: await canvas.encode('png'),
        width: Math.floor(viewport.width),
        height: Math.floor(viewport.height),
      });
      page.cleanup();
    }
    return images;
  } finally {
    await pdf.destroy();
  }
};

if (!parentPort) {
  throw new Error('PDF rendering must run in an isolated worker');
}

const port = parentPort;
const { data } = workerData as { data: Uint8Array };
void renderPdfToImage(data).then((images) => {
  port.postMessage(images);
  port.close();
});
