import { ZEnvelopeSchema } from '@documenso/lib/types/envelope';
import { generateOpenApiDocument } from 'trpc-to-openapi';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('@documenso/lib/server-only/public-api/get-api-token-by-token', () => ({ getApiTokenByToken: vi.fn() }));
vi.mock('@documenso/lib/utils/is-admin', () => ({ isAdmin: vi.fn() }));

import { authenticatedProcedure, router } from '../trpc';

describe('shape API documentation', () => {
  it('generates the envelope response without a circular generic JSON schema', () => {
    const api = router({
      get: authenticatedProcedure
        .meta({ openapi: { method: 'GET', path: '/envelope/{envelopeId}' } })
        .input(z.object({ envelopeId: z.string() }))
        .output(ZEnvelopeSchema)
        .query(() => {
          throw new Error('Documentation only');
        }),
    });
    const document = generateOpenApiDocument(api, { title: 'Shapes', version: '1', baseUrl: 'https://example.test' });
    expect(document.paths['/envelope/{envelopeId}']?.get?.responses['200']).toBeDefined();
  });
});
