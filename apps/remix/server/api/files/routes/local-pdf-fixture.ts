import { APP_DOCUMENT_UPLOAD_SIZE_LIMIT } from '@documenso/lib/constants/app';
import {
  clearLocalPdfFixture,
  getLocalPdfFixture,
  saveGeneratedLocalPdfFixture,
  saveUploadedLocalPdfFixture,
} from '@documenso/lib/server-only/pdf/local-pdf-fixture';
import { env } from '@documenso/lib/utils/env';
import { sValidator } from '@hono/standard-validator';
import { Hono } from 'hono';

import type { HonoEnv } from '../../../router';
import { ZLocalPdfFixturePageRequestSchema, ZUploadPdfRequestSchema } from '../files.types';

const route = new Hono<HonoEnv>();

route.use('*', async (c, next) => {
  if (env('NODE_ENV') !== 'development') {
    return c.json({ error: 'Not found' }, 404);
  }

  await next();
});

route.get('/', async (c) => {
  const fixture = await getLocalPdfFixture();

  if (!fixture) {
    return c.json({ error: 'Not found' }, 404);
  }

  return c.json({
    fileName: fixture.fileName,
    pageCount: fixture.pageCount,
    source: fixture.source,
  });
});

route.post('/generate', sValidator('json', ZLocalPdfFixturePageRequestSchema), async (c) => {
  const { pageCount } = c.req.valid('json');

  try {
    const fixture = await saveGeneratedLocalPdfFixture(pageCount);

    return c.json({
      fileName: fixture.fileName,
      pageCount: fixture.pageCount,
      source: fixture.source,
    });
  } catch (error) {
    console.error('Failed to generate local PDF fixture:', error);

    return c.json({ error: 'Unable to generate the local PDF fixture' }, 400);
  }
});

route.post('/upload', sValidator('form', ZUploadPdfRequestSchema), async (c) => {
  try {
    const { file } = c.req.valid('form');
    const maxFileSize = APP_DOCUMENT_UPLOAD_SIZE_LIMIT * 1024 * 1024;

    if (file.size > maxFileSize) {
      return c.json({ error: 'File too large' }, 400);
    }

    const fixture = await saveUploadedLocalPdfFixture(file);

    return c.json({
      fileName: fixture.fileName,
      pageCount: fixture.pageCount,
      source: fixture.source,
    });
  } catch (error) {
    console.error('Failed to upload local PDF fixture:', error);

    return c.json({ error: 'The local fixture must be a valid, unencrypted PDF' }, 400);
  }
});

route.delete('/', async (c) => {
  await clearLocalPdfFixture();

  return c.json({ ok: true });
});

export default route;
