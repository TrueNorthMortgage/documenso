import { PDF } from '@libpdf/core';
import { describe, expect, it } from 'vitest';

import { createLocalPdfFixtureBytes } from './local-pdf-fixture';

describe('local PDF fixture', () => {
  it('creates a one-page PDF', async () => {
    const pdf = await PDF.load(await createLocalPdfFixtureBytes(1));

    expect(pdf.getPageCount()).toBe(1);
  });

  it('creates the requested number of pages', async () => {
    const pdf = await PDF.load(await createLocalPdfFixtureBytes(3));

    expect(pdf.getPageCount()).toBe(3);
  });

  it('rejects page counts outside the supported range', async () => {
    await expect(createLocalPdfFixtureBytes(0)).rejects.toThrow();
    await expect(createLocalPdfFixtureBytes(101)).rejects.toThrow();
  });
});
