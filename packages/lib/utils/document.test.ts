import { describe, expect, it } from 'vitest';

import { stripPdfExtension } from './document';

describe('stripPdfExtension', () => {
  it('removes PDF extensions irrespective of their case', () => {
    expect(stripPdfExtension('THINK Client PO Request.PDF')).toBe('THINK Client PO Request');
  });

  it('removes repeated PDF extensions from legacy titles', () => {
    expect(stripPdfExtension('THINK Client PO Request.pdf.pdf')).toBe('THINK Client PO Request');
  });

  it('preserves a title without a PDF extension', () => {
    expect(stripPdfExtension('THINK Client PO Request')).toBe('THINK Client PO Request');
  });
});
