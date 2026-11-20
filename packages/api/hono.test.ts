import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { tsRestHonoApp } from './hono';

vi.mock('@documenso/api/v1/contract', async () => {
  const { initContract } = await import('@ts-rest/core');
  const { z } = await import('zod');

  return {
    ApiContractV1: initContract().router({
      getDocument: {
        method: 'GET',
        path: '/api/v1/documents/:id',
        responses: { 200: z.object({ id: z.string(), query: z.string().optional() }) },
        query: z.object({ query: z.string().optional() }),
      },
      updateDocument: {
        method: 'POST',
        path: '/api/v1/documents/:id',
        body: z.object({ title: z.string() }),
        responses: { 200: z.object({ title: z.string() }) },
      },
    }),
  };
});

vi.mock('@documenso/api/v1/implementation', () => ({
  ApiContractV1Implementation: {
    getDocument: async ({ params, query }: { params: { id: string }; query: { query?: string } }) => ({
      status: 200,
      body: { id: params.id, query: query.query },
    }),
    updateDocument: async ({ body }: { body: { title: string } }) => ({ status: 200, body }),
  },
}));

vi.mock('@documenso/api/v1/openapi', () => ({ OpenAPIV1: {} }));
vi.mock('@documenso/lib/server-only/public-api/test-credentials', () => ({
  testCredentialsHandler: async () => new Response('credentials'),
}));
vi.mock('@documenso/lib/server-only/rollbar', () => ({ reportServerError: vi.fn() }));
vi.mock('@documenso/lib/server-only/webhooks/zapier/list-documents', () => ({ listDocumentsHandler: vi.fn() }));
vi.mock('@documenso/lib/server-only/webhooks/zapier/subscribe', () => ({ subscribeHandler: vi.fn() }));
vi.mock('@documenso/lib/server-only/webhooks/zapier/unsubscribe', () => ({ unsubscribeHandler: vi.fn() }));

describe('API v1 Hono adapter', () => {
  const app = new Hono().route('/api/v1', tsRestHonoApp);

  it('preserves the contract prefix and query string for GET requests', async () => {
    const response = await app.request('/api/v1/documents/123?query=example');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: '123', query: 'example' });
  });

  it('preserves the method and body for POST requests', async () => {
    const response = await app.request('/api/v1/documents/123', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Example' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ title: 'Example' });
  });

  it('keeps explicitly registered API routes available', async () => {
    const response = await app.request('/api/v1/me');

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('credentials');
  });

  it('accepts requests from the production Node HTTP adapter', async () => {
    const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });

    try {
      if (!server.listening) {
        await new Promise<void>((resolve) => server.once('listening', resolve));
      }

      const address = server.address();

      if (!address || typeof address === 'string') {
        throw new Error('Expected a local TCP address');
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/documents/123`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Example' }),
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ title: 'Example' });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  });
});
