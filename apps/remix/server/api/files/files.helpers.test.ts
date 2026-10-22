import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { putPdfFileServerSide } from '@documenso/lib/universal/upload/put-file.server';
import { signPdf } from '@documenso/signing';
import { PDF } from '@libpdf/core';
import { DocumentDataType, DocumentStatus } from '@prisma/client';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HonoEnv } from '../../router';
import { handleEnvelopeItemFileRequest } from './files.helpers';

const mocks = vi.hoisted(() => ({
  createDocumentData: vi.fn(),
  getPresignGetUrl: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({
  prisma: { documentData: { create: mocks.createDocumentData } },
}));
vi.mock('@documenso/lib/server-only/team/get-team', () => ({ getTeamById: vi.fn() }));
vi.mock('@documenso/lib/universal/upload/server-actions', () => ({
  getPresignGetUrl: mocks.getPresignGetUrl,
  uploadS3File: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const verifySignature = (bytes: Uint8Array) => {
  const buffer = Buffer.from(bytes);
  const match = buffer.toString('latin1').match(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/);

  expect(match).not.toBeNull();

  const [, firstOffset, firstLength, secondOffset, secondLength] = (match ?? []).map(Number);

  expect(firstOffset).toBe(0);
  expect(secondOffset + secondLength).toBe(buffer.length);

  const contents = Buffer.concat([
    buffer.subarray(firstOffset, firstOffset + firstLength),
    buffer.subarray(secondOffset, secondOffset + secondLength),
  ]);
  const signature = Buffer.from(buffer.subarray(firstLength + 1, secondOffset - 1).toString(), 'hex');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'signed-download-'));

  try {
    const signaturePath = path.join(directory, 'signature.der');
    const contentsPath = path.join(directory, 'contents.bin');
    fs.writeFileSync(signaturePath, signature);
    fs.writeFileSync(contentsPath, contents);

    // Verify the CMS signature and content digest independently of the PDF library.
    // The public example certificate is self-signed, so trust-chain checks are excluded.
    execFileSync(
      'openssl',
      [
        'cms',
        '-verify',
        '-binary',
        '-inform',
        'DER',
        '-in',
        signaturePath,
        '-content',
        contentsPath,
        '-noverify',
        '-out',
        '/dev/null',
      ],
      { stdio: 'pipe' },
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
};

describe('completed PDF signature preservation', () => {
  it.each([
    'false',
    'true',
  ])('preserves signed bytes in storage and downloads (legacy subfilter: %s)', async (legacy) => {
    vi.stubEnv('NEXT_PRIVATE_SIGNING_TRANSPORT', 'local');
    vi.stubEnv('NEXT_PRIVATE_SIGNING_LOCAL_FILE_CONTENTS', '');
    vi.stubEnv('NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH', new URL('../../../example/cert.p12', import.meta.url).pathname);
    vi.stubEnv('NEXT_PRIVATE_SIGNING_PASSPHRASE', '');
    vi.stubEnv('NEXT_PRIVATE_SIGNING_TIMESTAMP_AUTHORITY', '');
    vi.stubEnv('NEXT_PRIVATE_USE_LEGACY_SIGNING_SUBFILTER', legacy);
    vi.stubEnv('NEXT_PUBLIC_UPLOAD_TRANSPORT', 'database');

    const pdf = PDF.create();
    pdf.addPage({ width: 612, height: 792 });
    const signedBytes = await signPdf({ pdf });

    verifySignature(signedBytes);

    mocks.createDocumentData.mockImplementation(async ({ data }) => ({ id: 'test-data', ...data }));

    const { documentData } = await putPdfFileServerSide({
      name: 'signed.pdf',
      type: 'application/pdf',
      arrayBuffer: async () => signedBytes,
    });

    expect(Buffer.from(documentData.data, 'base64')).toEqual(Buffer.from(signedBytes));

    const url = 'https://storage.example.invalid/signed.pdf';
    mocks.getPresignGetUrl.mockResolvedValue({ url });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(signedBytes)),
    );

    for (const type of [DocumentDataType.BYTES_64, DocumentDataType.S3_PATH]) {
      const app = new Hono<HonoEnv>();
      app.get('/download', (context) =>
        handleEnvelopeItemFileRequest({
          title: 'signed.pdf',
          status: DocumentStatus.COMPLETED,
          documentData: {
            type,
            data: type === DocumentDataType.BYTES_64 ? documentData.data : 'signed-key',
            initialData: 'original-data',
          },
          version: 'signed',
          isDownload: true,
          context,
        }),
      );

      const response = await app.request('/download');
      const downloadedBytes = new Uint8Array(await response.arrayBuffer());

      expect(response.status).toBe(200);
      expect(Buffer.from(downloadedBytes)).toEqual(Buffer.from(signedBytes));
      verifySignature(downloadedBytes);
    }

    const tamperedBytes = new Uint8Array(signedBytes);
    tamperedBytes[10] ^= 1;

    expect(() => verifySignature(tamperedBytes)).toThrow();
  });
});
