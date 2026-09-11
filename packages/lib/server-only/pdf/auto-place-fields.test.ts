import fs from 'node:fs';
import { PDF } from '@libpdf/core';
import { describe, expect, it } from 'vitest';

import { extractPdfPlaceholders } from './auto-place-fields';

const readFixture = () =>
  fs.readFileSync(
    new URL(
      '../../../../packages/assets/fixtures/auto-placement/project-proposal-single-recipient.pdf',
      import.meta.url,
    ),
  );

describe('extractPdfPlaceholders', () => {
  it('can extract placeholders from the source PDF while cleaning another PDF', async () => {
    const sourcePdf = readFixture();
    const sourceDocument = await PDF.load(sourcePdf);
    const targetDocument = PDF.create();

    for (const sourcePage of sourceDocument.getPages()) {
      targetDocument.addPage({ width: sourcePage.width, height: sourcePage.height });
    }

    const targetPdf = Buffer.from(await targetDocument.save());
    const result = await extractPdfPlaceholders(targetPdf, { sourcePdf });

    expect(result.placeholders.length).toBeGreaterThan(0);
    expect(result.cleanedPdf).not.toEqual(targetPdf);
  });
});
