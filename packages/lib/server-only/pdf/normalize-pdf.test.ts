import fs from 'node:fs';
import { PDF, PdfDict, PdfString } from '@libpdf/core';
import { describe, expect, it } from 'vitest';

import { AppErrorCode } from '../../errors/app-error';
import { normalizePdf } from './normalize-pdf';

const readFixture = (name: string) => fs.readFileSync(new URL(`../../../../assets/${name}`, import.meta.url));

describe('normalizePdf', () => {
  it('preserves regular documents without rasterizing or rewriting them', async () => {
    const source = readFixture('example.pdf');
    const normalized = await normalizePdf(source);
    const normalizedPdf = await PDF.load(normalized);

    expect(normalizedPdf.getPageCount()).toBe(1);
    expect(normalized).toEqual(source);
  });

  it('only rasterizes documents when explicitly requested', async () => {
    const normalized = await normalizePdf(readFixture('example.pdf'), { rasterize: true });

    expect(normalized.toString('latin1')).toContain('/Subtype /Image');
    expect(normalized.toString('latin1')).not.toContain('/Subtype /Font');
  });

  it('retains font resources when flattening an uploaded PDF for signing', async () => {
    const pdf = await PDF.load(readFixture('example.pdf'));

    pdf.flattenAll();

    const sealed = Buffer.from(await pdf.save());

    expect(sealed.toString('latin1')).toContain('/Type /Font');
  });

  it('keeps editable forms when rasterization is disabled', async () => {
    const normalized = await normalizePdf(readFixture('form-fields-test.pdf'), {
      flattenForm: false,
      rasterize: false,
    });
    const normalizedPdf = await PDF.load(normalized);

    expect(normalizedPdf.getForm()).toBeDefined();
  });

  it('preserves editable forms when flattening is disabled', async () => {
    const source = readFixture('form-fields-test.pdf');
    const normalized = await normalizePdf(source, { flattenForm: false });

    expect(normalized).toEqual(source);
  });

  it('flattens regular AcroForms when requested', async () => {
    const normalized = await normalizePdf(readFixture('form-fields-test.pdf'), {
      flattenForm: true,
      rasterize: false,
    });
    const normalizedPdf = await PDF.load(normalized);

    expect(normalized.toString('latin1')).not.toContain('/Subtype /Widget');
    expect(normalizedPdf.getForm()?.getFields() ?? []).toHaveLength(0);
  });

  it('rejects XFA forms with a user-facing upload error', async () => {
    const pdf = PDF.create();
    pdf.addPage({ width: 612, height: 792 });
    pdf.getCatalog().set(
      'AcroForm',
      PdfDict.of({
        XFA: PdfString.fromString('<xfa:datasets/>'),
      }),
    );

    const xfaPdf = Buffer.from(await pdf.save());

    await expect(normalizePdf(xfaPdf)).rejects.toMatchObject({
      code: AppErrorCode.UNSUPPORTED_XFA_PDF,
      userMessage:
        'This PDF uses an XFA form which cannot be displayed reliably. Open it in Adobe Acrobat, print to a new PDF, then upload that copy.',
    });
  });
});
