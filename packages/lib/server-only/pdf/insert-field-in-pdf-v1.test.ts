import fs from 'node:fs/promises';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from '@cantoo/pdf-lib';
import type { FieldWithSignature } from '@documenso/prisma/types/field-with-signature';
import { FieldType, Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { insertFieldInPDFV1 } from './insert-field-in-pdf-v1';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('insertFieldInPDFV1', () => {
  it.each([
    [FieldType.TEXT, 'Filled text ABC 123'],
    [FieldType.TEXT, 'Montréal — Иван'],
    [FieldType.NAME, 'Jane Doe'],
    [FieldType.EMAIL, 'jane@example.com'],
    [FieldType.DATE, '2026-10-22'],
    [FieldType.NUMBER, '12345'],
  ])('retains an embedded font after flattening %s containing %s', async (type, customText) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const filename = new URL(url).pathname.split('/').at(-1);
        const bytes = await fs.readFile(new URL(`../../../../apps/remix/public/fonts/${filename}`, import.meta.url));

        return new Response(bytes);
      }),
    );

    const field: FieldWithSignature = {
      id: 1,
      secondaryId: 'font-embedding-test',
      envelopeId: 'test-envelope',
      envelopeItemId: 'test-item',
      recipientId: 1,
      type,
      page: 1,
      positionX: new Prisma.Decimal(10),
      positionY: new Prisma.Decimal(10),
      width: new Prisma.Decimal(70),
      height: new Prisma.Decimal(8),
      customText,
      inserted: true,
      templateSourceItemId: null,
      fieldGroupId: null,
      fieldMeta: null,
    };

    const pdf = await PDFDocument.create();
    pdf.addPage([612, 792]);

    await insertFieldInPDFV1(pdf, field);
    pdf.getForm().flatten();

    const saved = await PDFDocument.load(await pdf.save());
    const resources = saved.getPage(0).node.Resources();
    const xObjects = resources?.lookup(PDFName.of('XObject'), PDFDict);

    expect(xObjects?.values()).toHaveLength(1);

    const appearance = saved.context.lookup(xObjects?.values()[0], PDFRawStream);
    const fonts = appearance.dict.lookup(PDFName.of('Resources'), PDFDict).lookup(PDFName.of('Font'), PDFDict);

    expect(fonts.values()).toHaveLength(1);

    const font = saved.context.lookup(fonts.values()[0], PDFDict);

    expect(font.lookup(PDFName.of('BaseFont'), PDFName).toString()).toContain('NotoSans');

    const descendant = font.lookup(PDFName.of('DescendantFonts'), PDFArray).lookup(0, PDFDict);
    const descriptor = descendant.lookup(PDFName.of('FontDescriptor'), PDFDict);
    const fontFile = descriptor.lookup(PDFName.of('FontFile2'), PDFRawStream);

    expect(fontFile.getContents().length).toBeGreaterThan(0);
    expect(saved.getForm().getFields()).toHaveLength(0);
  });
});
