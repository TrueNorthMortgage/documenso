import fs from 'node:fs';
import { PDF } from '@libpdf/core';
import { describe, expect, it } from 'vitest';

import { normalizePdf } from './normalize-pdf';

const readFixture = (name: string) => fs.readFileSync(new URL(`../../../../assets/${name}`, import.meta.url));

describe('normalizePdf', () => {
  it('rasterizes regular documents without retaining source fonts', async () => {
    const normalized = await normalizePdf(readFixture('example.pdf'));
    const normalizedPdf = await PDF.load(normalized);

    expect(normalizedPdf.getPageCount()).toBe(1);
    expect(normalized.toString('latin1')).toContain('/Subtype /Image');
    expect(normalized.toString('latin1')).not.toContain('/Subtype /Font');
  });

  it('keeps editable forms when rasterization is disabled', async () => {
    const normalized = await normalizePdf(readFixture('form-fields-test.pdf'), {
      flattenForm: false,
      rasterize: false,
    });
    const normalizedPdf = await PDF.load(normalized);

    expect(normalizedPdf.getForm()).toBeDefined();
  });
});
