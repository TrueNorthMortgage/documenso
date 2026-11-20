import { readFile } from 'node:fs/promises';
import { Canvas, loadImage } from 'skia-canvas';
import { describe, expect, it } from 'vitest';

import { pdfToImages } from './pdf-to-images';

describe('PDF page images', () => {
  it('renders JPEG 2000 images instead of silently producing a blank page', async () => {
    const pdf = await readFile(new URL('./fixtures/jpeg2000.pdf', import.meta.url));
    const pages = await pdfToImages(new Uint8Array(pdf), { scale: 1 });

    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ width: 240, height: 160 });
    await expectRenderedColors(pages[0].image);
  });

  it('preserves ordinary JPEG images when scaling the preview', async () => {
    const pdf = await readFile(new URL('./fixtures/jpeg.pdf', import.meta.url));
    const pages = await pdfToImages(new Uint8Array(pdf), { maxDimension: 120 });

    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ width: 120, height: 80 });
    await expectRenderedColors(pages[0].image);
  });
});

const expectRenderedColors = async (bytes: Buffer) => {
  const image = await loadImage(bytes);
  const canvas = new Canvas(image.width, image.height);
  canvas.gpu = false;
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);

  const left = context.getImageData(Math.floor(image.width / 4), Math.floor(image.height / 2), 1, 1).data;
  const right = context.getImageData(Math.floor((image.width * 3) / 4), Math.floor(image.height / 2), 1, 1).data;

  expect(left[0]).toBeGreaterThan(180);
  expect(left[1]).toBeLessThan(80);
  expect(left[2]).toBeLessThan(90);
  expect(right[0]).toBeLessThan(80);
  expect(right[1]).toBeLessThan(100);
  expect(right[2]).toBeGreaterThan(180);
};
