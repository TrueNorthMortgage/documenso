import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { HonoAuthContext } from '../../types/context';
import { onAuthorize } from '../utils/authorizer';
import { validateSessionToken } from './session';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
  deleteMany: vi.fn(),
  update: vi.fn(),
  createAuditLog: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({
  prisma: {
    session: {
      create: mocks.create,
      findUnique: mocks.findUnique,
      deleteMany: mocks.deleteMany,
      update: mocks.update,
    },
    userSecurityAuditLog: { create: mocks.createAuditLog },
  },
}));

describe('session expiry', () => {
  const signedInAt = new Date('2026-11-09T16:00:00.000Z');
  const expiresAt = new Date('2026-11-10T00:00:00.000Z');

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('NEXTAUTH_SECRET', 'session-test-secret');
    vi.setSystemTime(signedInAt);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('uses the stored eight-hour deadline as the cookie expiry at sign-in', async () => {
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

  it.each([
    expiresAt,
    new Date('2026-11-16T16:00:00.000Z'),
  ])('preserves the stored deadline before expiry (%s)', async (storedExpiry) => {
    mocks.findUnique.mockResolvedValue({ id: 'session-id', expiresAt: storedExpiry, user: { id: 42 } });
    vi.setSystemTime(new Date(storedExpiry.getTime() - 1));

    const result = await validateSessionToken('test-token');

    expect(result.isAuthenticated).toBe(true);
    expect(result.session?.expiresAt).toEqual(storedExpiry);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects the token at its deadline even if another request already removed the session', async () => {
    mocks.findUnique.mockResolvedValue({ id: 'session-id', expiresAt, user: { id: 42 } });
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    vi.setSystemTime(expiresAt);

    await expect(validateSessionToken('test-token')).resolves.toEqual({
      session: null,
      user: null,
      isAuthenticated: false,
    });
    expect(mocks.deleteMany).toHaveBeenCalledTimes(1);
  });
});
