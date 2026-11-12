// Check before the legacy build adds polyfills to the page. The worker still needs its own.
const supportsModernBuild =
  'try' in Promise &&
  typeof Promise.try === 'function' &&
  'toHex' in Uint8Array.prototype &&
  typeof Uint8Array.prototype.toHex === 'function';

export const loadPdfJs = async () => {
  const [pdfJs, worker] = await (supportsModernBuild
    ? Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker?url')])
    : Promise.all([import('pdfjs-dist/legacy/build/pdf.mjs'), import('pdfjs-dist/legacy/build/pdf.worker.mjs?url')]));

  pdfJs.GlobalWorkerOptions.workerSrc = worker.default;

  return pdfJs;
};
