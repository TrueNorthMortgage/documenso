import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DOCUMENT_CONVERSION_MIME_TYPE_DOCX } from '../../constants/document-conversion';
import { AppError } from '../../errors/app-error';
import { recordSuccess } from './circuit-breaker';
import { convertDocxToPdf } from './docx-to-pdf';
import { convertToPdf } from './index';

const createFile = (type: string, name = 'document.docx') => ({
  name,
  type,
  arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
});

const expectAppErrorCode = async (promise: Promise<unknown>, code: string) => {
  try {
    await promise;
    expect.unreachable('expected the operation to throw');
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
  }
};

describe('document conversion', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PRIVATE_DOCUMENT_CONVERSION_URL', 'http://gotenberg.test');
    vi.stubEnv('NEXT_PRIVATE_DOCUMENT_CONVERSION_TIMEOUT_MS', '30000');
    recordSuccess();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    recordSuccess();
  });

  it('passes PDF files through unchanged', async () => {
    const file = createFile('application/pdf', 'document.pdf');
    const result = await convertToPdf(file);

    expect(result).toEqual(Buffer.from([1, 2, 3]));
  });

  it('converts DOCX files to PDF', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Uint8Array.from([4, 5, 6]).buffer,
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await convertToPdf(createFile(DOCUMENT_CONVERSION_MIME_TYPE_DOCX));

    expect(result).toEqual(Buffer.from([4, 5, 6]));
    expect(fetchMock).toHaveBeenCalledWith(
      'http://gotenberg.test/forms/libreoffice/convert',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects unsupported file types', async () => {
    await expectAppErrorCode(convertToPdf(createFile('text/plain', 'document.txt')), 'UNSUPPORTED_FILE_TYPE');
  });

  it('rejects DOCX conversion when the service is not configured', async () => {
    vi.stubEnv('NEXT_PRIVATE_DOCUMENT_CONVERSION_URL', '');

    await expectAppErrorCode(
      convertDocxToPdf({ buffer: Buffer.from([1]), filename: 'document.docx' }),
      'CONVERSION_SERVICE_UNAVAILABLE',
    );
  });

  it('reports malformed documents as conversion failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: async () => 'Malformed DOCX',
      }),
    );

    await expectAppErrorCode(
      convertDocxToPdf({ buffer: Buffer.from([1]), filename: 'document.docx' }),
      'CONVERSION_FAILED',
    );
  });

  it('maps network failures to service-unavailable errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connection refused')));

    await expectAppErrorCode(
      convertDocxToPdf({ buffer: Buffer.from([1]), filename: 'document.docx' }),
      'CONVERSION_SERVICE_UNAVAILABLE',
    );
  });

  it('maps conversion timeouts to service-unavailable errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(Object.assign(new Error('request aborted'), { name: 'AbortError' })),
    );

    await expectAppErrorCode(
      convertDocxToPdf({ buffer: Buffer.from([1]), filename: 'document.docx' }),
      'CONVERSION_SERVICE_UNAVAILABLE',
    );
  });
});
