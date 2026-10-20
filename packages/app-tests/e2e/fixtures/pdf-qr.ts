import { Worker } from 'node:worker_threads';

// Server imports install Skia globals. PDF.js requires its own canvas globals,
// so render in a worker rather than changing globals in the Playwright process.
export const readPdfQrCode = (data: Uint8Array) =>
  new Promise<string>((resolve, reject) => {
    const worker = new Worker(
      `const { workerData } = require('node:worker_threads');
       require('tsx/cjs/api').require(workerData.module, workerData.module);`,
      {
        eval: true,
        execArgv: [],
        workerData: { module: require.resolve('./pdf-qr.worker.ts'), data },
      },
    );
    let qrUrl: string | undefined;

    worker.on('message', (value: unknown) => {
      if (typeof value === 'string') {
        qrUrl = value;
      }
    });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code === 0 && qrUrl) {
        resolve(qrUrl);
      } else {
        reject(new Error(`PDF QR worker exited without a result (code ${code})`));
      }
    });
  });
