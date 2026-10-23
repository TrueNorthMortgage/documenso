import { Worker } from 'node:worker_threads';

type PdfPageImage = { image: Buffer; width: number; height: number };

// Application imports install Skia globals. Keep PDF.js and its native canvas
// in a separate worker so their Path2D implementations cannot conflict.
export const renderPdfToImage = (data: Uint8Array): Promise<PdfPageImage[]> =>
  new Promise((resolve, reject) => {
    const worker = new Worker(
      `const { workerData } = require('node:worker_threads');
       require('tsx/cjs/api').require(workerData.module, workerData.module);`,
      {
        eval: true,
        execArgv: [],
        workerData: { module: require.resolve('./pdf-render.worker.ts'), data },
      },
    );
    let images: PdfPageImage[] | undefined;

    worker.on('message', (pages: PdfPageImage[]) => {
      images = pages.map((page) => ({ ...page, image: Buffer.from(page.image) }));
    });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code === 0 && images) {
        resolve(images);
      } else {
        reject(new Error(`PDF rendering worker exited without a result (code ${code})`));
      }
    });
  });
