import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getOidcTeamUrlForEmail } from '../auth/oidc-domain-map';
import { sendForgotPassword } from '../auth/send-forgot-password';
import { forgotPassword } from './forgot-password';

const { findUser, createToken } = vi.hoisted(() => ({
  findUser: vi.fn(),
  createToken: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({
  prisma: {
    user: { findFirst: findUser },
    passwordResetToken: { create: createToken },
  },
}));

vi.mock('../auth/send-forgot-password', () => ({ sendForgotPassword: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PRIVATE_OIDC_WELL_KNOWN', 'https://identity.example/.well-known/openid-configuration');
  vi.stubEnv('NEXT_PRIVATE_OIDC_CLIENT_ID', 'test-client');
  vi.stubEnv('NEXT_PRIVATE_OIDC_CLIENT_SECRET', 'test-secret');
  vi.stubEnv('SELF_HOSTED_OIDC_AUTO_PROVISION_ENABLED', 'true');
  vi.stubEnv('SELF_HOSTED_OIDC_TEAM_DOMAIN_MAP', 'alpha.example:alpha,beta.example:beta,gamma.example:gamma');
  findUser.mockResolvedValue(null);
  createToken.mockResolvedValue({});
  vi.mocked(sendForgotPassword).mockResolvedValue(undefined as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('forgotPassword', () => {
  it.each([
    'new@alpha.example',
    'USER@BETA.EXAMPLE',
    'user@gamma.example',
  ])('returns SSO guidance for %s without an account lookup, token, or email', async (email) => {
    expect(await forgotPassword({ email })).toEqual({ usesSso: true });
    expect(findUser).not.toHaveBeenCalled();
    expect(createToken).not.toHaveBeenCalled();
    expect(sendForgotPassword).not.toHaveBeenCalled();
  });

  it('uses the current domain configuration rather than a fixed list', async () => {
    vi.stubEnv('SELF_HOSTED_OIDC_TEAM_DOMAIN_MAP', 'new.example:new-team');

    expect(await forgotPassword({ email: 'user@new.example' })).toEqual({ usesSso: true });
    expect(await forgotPassword({ email: 'user@alpha.example' })).toEqual({ usesSso: false });
  });

  it('preserves password reset for an existing user outside SSO domains', async () => {
    findUser.mockResolvedValue({ id: 42 });

    expect(await forgotPassword({ email: 'admin@external.example' })).toEqual({ usesSso: false });
    expect(createToken).toHaveBeenCalledWith({
      data: { userId: 42, token: expect.any(String), expiry: expect.any(Date) },
    });
    expect(sendForgotPassword).toHaveBeenCalledWith({ userId: 42 });
  });

  it('does not send email or expose account existence for an unknown non-SSO address', async () => {
    expect(await forgotPassword({ email: 'unknown@external.example' })).toEqual({ usesSso: false });
    expect(createToken).not.toHaveBeenCalled();
    expect(sendForgotPassword).not.toHaveBeenCalled();
  });

  it.each([undefined, '', '   '])('preserves password reset when the domain map is %s', async (domainMap) => {
    vi.stubEnv('SELF_HOSTED_OIDC_TEAM_DOMAIN_MAP', domainMap);
    findUser.mockResolvedValue({ id: 42 });

    expect(await forgotPassword({ email: 'user@alpha.example' })).toEqual({ usesSso: false });
    expect(createToken).toHaveBeenCalledWith({
      data: { userId: 42, token: expect.any(String), expiry: expect.any(Date) },
    });
    expect(sendForgotPassword).toHaveBeenCalledWith({ userId: 42 });
    expect(() => getOidcTeamUrlForEmail('user@alpha.example')).toThrow('SELF_HOSTED_OIDC_TEAM_DOMAIN_MAP is required');
  });

  it.each([
    'alpha.example',
    'alpha.example:alpha,alpha.example:other',
  ])('rejects an invalid populated domain map: %s', async (domainMap) => {
    vi.stubEnv('SELF_HOSTED_OIDC_TEAM_DOMAIN_MAP', domainMap);

    await expect(forgotPassword({ email: 'user@alpha.example' })).rejects.toThrow();
    expect(findUser).not.toHaveBeenCalled();
    expect(createToken).not.toHaveBeenCalled();
    expect(sendForgotPassword).not.toHaveBeenCalled();
  });

  it.each([
    'SELF_HOSTED_OIDC_AUTO_PROVISION_ENABLED',
    'NEXT_PRIVATE_OIDC_CLIENT_SECRET',
  ])('preserves password reset when SSO is disabled through %s', async (setting) => {
    vi.stubEnv(setting, '');
    findUser.mockResolvedValue({ id: 42 });

    expect(await forgotPassword({ email: 'user@alpha.example' })).toEqual({ usesSso: false });
    expect(sendForgotPassword).toHaveBeenCalledWith({ userId: 42 });
  });

  it('does not treat subdomains or suffix matches as configured SSO domains', async () => {
    expect(await forgotPassword({ email: 'user@sub.alpha.example' })).toEqual({ usesSso: false });
    expect(await forgotPassword({ email: 'user@notalpha.example' })).toEqual({ usesSso: false });
  });
});
