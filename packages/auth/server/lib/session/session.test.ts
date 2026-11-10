import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HonoAuthContext } from '../../types/context';
import { onAuthorize } from '../utils/authorizer';
import { getOptionalSession, sessionRenewalMiddleware } from '../utils/get-session';
import { validateSessionToken } from './session';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
  deleteMany: vi.fn(),
  updateManyAndReturn: vi.fn(),
  createAuditLog: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({
  prisma: {
    session: {
      create: mocks.create,
      findUnique: mocks.findUnique,
      deleteMany: mocks.deleteMany,
      updateManyAndReturn: mocks.updateManyAndReturn,
    },
    userSecurityAuditLog: { create: mocks.createAuditLog },
  },
}));

describe('session expiry', () => {
  const signedInAt = new Date('2026-11-09T16:00:00.000Z');
  const expiresAt = new Date('2026-11-11T16:00:00.000Z');

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('NEXTAUTH_SECRET', 'session-test-secret');
    vi.setSystemTime(signedInAt);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('uses the stored 48-hour deadline as the cookie expiry at sign-in', async () => {
    const app = new Hono<HonoAuthContext>();
    app.post('/sign-in', async (context) => {
      context.set('requestMetadata', {});
      await onAuthorize({ userId: 42 }, context);
      return context.body(null, 204);
    });

    const response = await app.request('/sign-in', { method: 'POST' });

    expect(response.status).toBe(204);
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ expiresAt }) });
    expect(response.headers.get('set-cookie')).toContain(`Expires=${expiresAt.toUTCString()}`);
  });

  it('extends the session and its cookie on activity before and after the original deadline', async () => {
    const app = new Hono<HonoAuthContext>();
    app.use(contextStorage(), sessionRenewalMiddleware);
    app.post('/sign-in', async (context) => {
      context.set('requestMetadata', {});
      await onAuthorize({ userId: 42 }, context);
      return context.body(null, 204);
    });
    app.get('/document', async (context) => {
      // React Router loaders can receive a different Request object.
      const results = await Promise.all([getOptionalSession(context.req.raw.clone()), getOptionalSession(context)]);
      return new Response(null, { status: results.every((result) => result.isAuthenticated) ? 204 : 401 });
    });

    const signIn = await app.request('/sign-in', { method: 'POST' });
    const cookie = signIn.headers.get('set-cookie')?.split(';')[0] ?? '';
    const firstActivity = new Date('2026-11-11T15:00:00.000Z');
    const secondActivity = new Date('2026-11-12T16:00:00.000Z');
    const firstRenewal = new Date('2026-11-13T15:00:00.000Z');
    const secondRenewal = new Date('2026-11-14T16:00:00.000Z');

    mocks.updateManyAndReturn
      .mockResolvedValueOnce([{ id: 'session-id', expiresAt: firstRenewal, user: { id: 42 } }])
      .mockResolvedValueOnce([{ id: 'session-id', expiresAt: secondRenewal, user: { id: 42 } }]);

    vi.setSystemTime(firstActivity);
    const firstResponse = await app.request('/document', { headers: { cookie } });
    expect(firstResponse.status).toBe(204);
    expect(firstResponse.headers.getSetCookie()).toHaveLength(1);
    expect(firstResponse.headers.get('set-cookie')).toContain(`Expires=${firstRenewal.toUTCString()}`);

    vi.setSystemTime(secondActivity);
    const secondResponse = await app.request('/document', { headers: { cookie } });
    expect(secondResponse.status).toBe(204);
    expect(secondResponse.headers.get('set-cookie')).toContain(`Expires=${secondRenewal.toUTCString()}`);
    expect(mocks.updateManyAndReturn).toHaveBeenCalledTimes(2);
    expect(mocks.updateManyAndReturn).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          expiresAt: { gt: secondActivity },
          updatedAt: { gt: new Date('2026-11-10T16:00:00.000Z'), lt: secondActivity },
        }),
        data: { expiresAt: secondRenewal, updatedAt: secondActivity },
      }),
    );
  });

  it.each([
    expiresAt,
    new Date('2026-12-09T16:00:00.000Z'),
  ])('rejects the token after 48 hours of inactivity even with a stored expiry of %s', async (storedExpiry) => {
    mocks.updateManyAndReturn.mockResolvedValue([]);
    mocks.findUnique.mockResolvedValue({
      id: 'session-id',
      expiresAt: storedExpiry,
      updatedAt: signedInAt,
      user: { id: 42 },
    });
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    vi.setSystemTime(expiresAt);

    await expect(validateSessionToken('test-token', true)).resolves.toEqual({
      session: null,
      user: null,
      isAuthenticated: false,
    });
    expect(mocks.deleteMany).toHaveBeenCalledTimes(1);
  });
});
