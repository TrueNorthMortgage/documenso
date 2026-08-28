import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDF, StandardFonts } from '@libpdf/core';

import { env } from '../../utils/env';

const LOCAL_PDF_FIXTURE_DIRECTORY = '/tmp/documenso-local-pdf-fixtures';
const LOCAL_PDF_FIXTURE_PATH = join(LOCAL_PDF_FIXTURE_DIRECTORY, 'document.pdf');
const LOCAL_PDF_FIXTURE_METADATA_PATH = join(LOCAL_PDF_FIXTURE_DIRECTORY, 'document.json');
const MAX_LOCAL_PDF_FIXTURE_PAGES = 100;

export type LocalPdfFixtureSource = 'generated' | 'uploaded';

export type LocalPdfFixture = {
  data: Uint8Array;
  fileName: string;
  pageCount: number;
  source: LocalPdfFixtureSource;
};

const isLocalPdfFixtureEnabled = () => env('NODE_ENV') === 'development';

const validatePageCount = (pageCount: number) => {
  if (!Number.isInteger(pageCount) || pageCount < 1 || pageCount > MAX_LOCAL_PDF_FIXTURE_PAGES) {
    throw new Error(`Local PDF fixture page count must be between 1 and ${MAX_LOCAL_PDF_FIXTURE_PAGES}`);
  }
};

const writeLocalPdfFixture = async (data: Uint8Array) => {
  await mkdir(LOCAL_PDF_FIXTURE_DIRECTORY, { recursive: true });

  const temporaryPath = join(LOCAL_PDF_FIXTURE_DIRECTORY, `${randomUUID()}.tmp`);

  await writeFile(temporaryPath, data);
  await rename(temporaryPath, LOCAL_PDF_FIXTURE_PATH);
};

const writeLocalPdfFixtureMetadata = async ({
  fileName,
  pageCount,
  source,
}: Pick<LocalPdfFixture, 'fileName' | 'pageCount' | 'source'>) => {
  await writeFile(LOCAL_PDF_FIXTURE_METADATA_PATH, JSON.stringify({ fileName, pageCount, source }), 'utf8');
};

export const createLocalPdfFixtureBytes = async (pageCount: number) => {
  validatePageCount(pageCount);

  const pdf = PDF.create();

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = pdf.addPage({ size: 'letter' });

    page.drawText(`Local PDF fixture - page ${pageNumber} of ${pageCount}`, {
      x: 36,
      y: 740,
      font: StandardFonts.Helvetica,
      size: 14,
    });
  }

  return new Uint8Array(await pdf.save());
};

export const saveGeneratedLocalPdfFixture = async (pageCount: number) => {
  const data = await createLocalPdfFixtureBytes(pageCount);

  await writeLocalPdfFixture(data);
  await writeLocalPdfFixtureMetadata({
    fileName: 'generated-local-document.pdf',
    pageCount,
    source: 'generated',
  });

  return {
    data,
    fileName: 'generated-local-document.pdf',
    pageCount,
    source: 'generated' as const,
  } satisfies LocalPdfFixture;
};

export const saveUploadedLocalPdfFixture = async (file: File) => {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await PDF.load(data).catch(() => null);

  if (!pdf || pdf.isEncrypted) {
    throw new Error('The local fixture must be a valid, unencrypted PDF');
  }

  await writeLocalPdfFixture(data);
  await writeLocalPdfFixtureMetadata({
    fileName: file.name || 'uploaded-local-document.pdf',
    pageCount: pdf.getPageCount(),
    source: 'uploaded',
  });

  return {
    data,
    fileName: file.name || 'uploaded-local-document.pdf',
    pageCount: pdf.getPageCount(),
    source: 'uploaded' as const,
  } satisfies LocalPdfFixture;
};

export const getLocalPdfFixture = async (): Promise<LocalPdfFixture | null> => {
  if (!isLocalPdfFixtureEnabled()) {
    return null;
  }

  const data = await readFile(LOCAL_PDF_FIXTURE_PATH).catch(() => null);

  if (!data) {
    return saveGeneratedLocalPdfFixture(1);
  }

  const pdf = await PDF.load(data).catch(() => null);

  if (!pdf || pdf.isEncrypted) {
    return saveGeneratedLocalPdfFixture(1);
  }

  const metadata = await readFile(LOCAL_PDF_FIXTURE_METADATA_PATH, 'utf8')
    .then((value) => JSON.parse(value) as Pick<LocalPdfFixture, 'fileName' | 'pageCount' | 'source'>)
    .catch(() => undefined);

  return {
    data: new Uint8Array(data),
    fileName: metadata?.fileName ?? 'local-document.pdf',
    pageCount: metadata?.pageCount ?? pdf.getPageCount(),
    source: metadata?.source ?? 'uploaded',
  };
};

export const clearLocalPdfFixture = async () => {
  if (!isLocalPdfFixtureEnabled()) {
    return;
  }

  await rm(LOCAL_PDF_FIXTURE_PATH, { force: true });
  await rm(LOCAL_PDF_FIXTURE_METADATA_PATH, { force: true });
};
