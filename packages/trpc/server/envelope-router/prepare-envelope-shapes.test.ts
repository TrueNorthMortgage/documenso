import { PDF } from '@libpdf/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ convert: vi.fn(), normalize: vi.fn(), placeholders: vi.fn(), put: vi.fn() }));
vi.mock('@documenso/lib/server-only/document-conversion', () => ({ convertToPdf: mocks.convert }));
vi.mock('@documenso/lib/server-only/pdf/normalize-pdf', () => ({ normalizePdf: mocks.normalize }));
vi.mock('@documenso/lib/server-only/pdf/auto-place-fields', () => ({ extractPdfPlaceholders: mocks.placeholders }));
vi.mock('../../../lib/universal/upload/put-file.server', () => ({ putPdfFileServerSide: mocks.put }));
vi.mock('../../../lib/server-only/envelope/map-envelope-recipients', () => ({ mapEnvelopeRecipients: () => [] }));

import { prepareEnvelopeData } from './prepare-envelope-data';

const shape = {
  id: '00000000-0000-4000-8000-000000000001',
  type: 'rectangle' as const,
  page: 1,
  positionX: 10,
  positionY: 20,
  width: 30,
  height: 15,
  color: '#000000' as const,
  thickness: 2,
};
const files = [new File(['test'], 'first.pdf'), new File(['test'], 'second.pdf')];

beforeEach(async () => {
  vi.clearAllMocks();
  const pdf = PDF.create();
  pdf.addPage({ width: 600, height: 800 });
  const bytes = await pdf.save();
  mocks.convert.mockResolvedValue(bytes);
  mocks.normalize.mockResolvedValue(bytes);
  mocks.placeholders.mockResolvedValue({ cleanedPdf: bytes, placeholders: [] });
  mocks.put.mockResolvedValue({ documentData: { id: 'data_test' } });
});

describe('embedded and API document shape payloads', () => {
  it('associates local shapes with the correct uploaded document', async () => {
    const result = await prepareEnvelopeData({
      payload: { title: 'Test', type: 'DOCUMENT', documentShapes: [{ identifier: 1, shapes: [shape] }] },
      files,
    });
    expect(result.envelopeItems[0].shapes).toEqual([]);
    expect(result.envelopeItems[1].shapes).toEqual([shape]);
  });

  it('rejects nonexistent PDF pages before storing the file', async () => {
    await expect(
      prepareEnvelopeData({
        payload: {
          title: 'Test',
          type: 'DOCUMENT',
          documentShapes: [{ identifier: 0, shapes: [{ ...shape, page: 2 }] }],
        },
        files: [files[0]],
      }),
    ).rejects.toMatchObject({ code: 'INVALID_BODY' });
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it('rejects a shape payload referring to a missing uploaded document', async () => {
    await expect(
      prepareEnvelopeData({
        payload: { title: 'Test', type: 'DOCUMENT', documentShapes: [{ identifier: 2, shapes: [shape] }] },
        files,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_BODY' });
    expect(mocks.convert).not.toHaveBeenCalled();
  });
});
