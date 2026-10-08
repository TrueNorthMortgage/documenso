import superjson from 'superjson';
import { describe, expect, it } from 'vitest';

import { parseSessionResponse } from './parse-session-response';

describe('session response parsing', () => {
  it('preserves an unauthenticated session response', async () => {
    const session = { isAuthenticated: false, user: null, session: null };
    expect(await parseSessionResponse(Response.json(superjson.serialize(session)))).toEqual(session);
  });

  it('preserves serialized session dates', async () => {
    const session = { isAuthenticated: true, session: { expiresAt: new Date('2026-01-01T00:00:00Z') } };
    expect(await parseSessionResponse(Response.json(superjson.serialize(session)))).toEqual(session);
  });

  it('preserves application errors returned as JSON', async () => {
    const response = Response.json({ code: 'FORBIDDEN', message: 'Access denied', statusCode: 403 }, { status: 403 });
    await expect(parseSessionResponse(response)).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
  });

  it('reports an empty successful response as invalid upstream JSON', async () => {
    await expect(parseSessionResponse(new Response('', { status: 200 }))).rejects.toMatchObject({
      name: 'AppError',
      statusCode: 502,
      message: 'Session endpoint returned invalid JSON (HTTP 200)',
    });
  });

  it('retains the upstream HTTP status without including HTML response contents', async () => {
    const response = new Response('<html>private proxy details</html>', { status: 503 });
    await expect(parseSessionResponse(response)).rejects.toMatchObject({
      name: 'AppError',
      statusCode: 503,
      message: 'Session endpoint returned invalid JSON (HTTP 503)',
    });
  });

  it.each([
    new TypeError('Failed to fetch'),
    new DOMException('Aborted', 'AbortError'),
  ])('preserves body-read network failures for background handling: %s', async (error) => {
    const response = new Response();
    response.json = () => Promise.reject(error);
    await expect(parseSessionResponse(response)).rejects.toBe(error);
  });
});
