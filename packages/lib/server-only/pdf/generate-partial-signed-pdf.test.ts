import { fileURLToPath } from 'node:url';
import { PDF } from '@libpdf/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TEnvelopeShape } from '../../types/envelope-shape';
import { generatePartialSignedPdf } from './generate-partial-signed-pdf';

afterEach(() => vi.restoreAllMocks());

describe('PDFs containing document shapes', () => {
  it('embeds shape-only pages even when no recipient fields are present', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(fileURLToPath(new URL('../../../../apps/remix/', import.meta.url)));
    const original = PDF.create();
    original.addPage({ width: 600, height: 800 });
    original.addPage({ width: 800, height: 600 });
    const shape: TEnvelopeShape = {
      id: '00000000-0000-4000-8000-000000000001',
      type: 'rectangle',
      page: 2,
      positionX: 10,
      positionY: 20,
      width: 30,
      height: 15,
      color: '#b91c1c',
      thickness: 2,
    };
    const bytes = await generatePartialSignedPdf({ pdfData: await original.save(), fields: [], shapes: [shape] });
    const result = await PDF.load(bytes);

    expect(result.getPageCount()).toBe(2);
    expect(result.getPage(0)?.getResources().get('XObject')).toBeUndefined();
    expect(result.getPage(1)?.getResources().get('XObject')).toBeDefined();
    expect(result.getPage(1)?.width).toBe(800);
    expect(result.getPage(1)?.height).toBe(600);
  });
});
