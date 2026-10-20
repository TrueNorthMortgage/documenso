import { parentPort, workerData } from 'node:worker_threads';
import { createCanvas } from '@napi-rs/canvas';
import jsQR from 'jsqr';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Decode the rendered PDF, so a missing or blank QR cannot pass on token metadata alone.
const readPdfQrCode = async (data: Uint8Array) => {
  const pdf = await getDocument({ data }).promise;

  try {
    // Certificates follow the signed content. Start at the end to keep this check fast.
    for (let pageNumber = pdf.numPages; pageNumber >= 1; pageNumber--) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d');

      await page.render({
        // @ts-expect-error The native canvas implements PDF.js runtime requirements.
        canvas,
        // @ts-expect-error The native context implements PDF.js runtime requirements.
        canvasContext: context,
        viewport,
      }).promise;

      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });

      if (code) {
        return code.data;
      }
    }

    throw new Error('No readable QR code found in the downloaded PDF');
  } finally {
    await pdf.destroy();
  }
};

if (!parentPort) {
  throw new Error('PDF QR decoding must run in an isolated worker');
}

const port = parentPort;
const { data } = workerData as { data: Uint8Array };
void readPdfQrCode(data).then((qrUrl) => {
  port.postMessage(qrUrl);
  port.close();
});
