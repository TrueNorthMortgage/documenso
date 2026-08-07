import { afterEach, describe, expect, it } from 'vitest';

import { getOidcTeamUrlForEmail, isOidcAutoProvisioningEnabled } from './oidc-auto-provision';

const originalEnabled = process.env.SELF_HOSTED_OIDC_AUTO_PROVISION_ENABLED;
const originalMap = process.env.SELF_HOSTED_OIDC_TEAM_DOMAIN_MAP;

afterEach(() => {
  if (originalEnabled === undefined) {
    delete process.env.SELF_HOSTED_OIDC_AUTO_PROVISION_ENABLED;
  } else {
    process.env.SELF_HOSTED_OIDC_AUTO_PROVISION_ENABLED = originalEnabled;
  }

  if (originalMap === undefined) {
    delete process.env.SELF_HOSTED_OIDC_TEAM_DOMAIN_MAP;
  } else {
    process.env.SELF_HOSTED_OIDC_TEAM_DOMAIN_MAP = originalMap;
  }
});

describe('OIDC email-domain team provisioning', () => {
  it('resolves a team URL case-insensitively from the configured map', () => {
    process.env.SELF_HOSTED_OIDC_AUTO_PROVISION_ENABLED = 'true';
    process.env.SELF_HOSTED_OIDC_TEAM_DOMAIN_MAP = 'alpha.example:team-alpha,beta.example:team-beta';

    expect(isOidcAutoProvisioningEnabled()).toBe(true);
    expect(getOidcTeamUrlForEmail('User@ALPHA.EXAMPLE')).toBe('team-alpha');
  });

  it('returns no team for an unmapped domain', () => {
    process.env.SELF_HOSTED_OIDC_TEAM_DOMAIN_MAP = 'alpha.example:team-alpha';

    expect(getOidcTeamUrlForEmail('user@unknown.example')).toBeNull();
  });

  it('rejects malformed map entries', () => {
    process.env.SELF_HOSTED_OIDC_TEAM_DOMAIN_MAP = 'alpha.example';

    expect(() => getOidcTeamUrlForEmail('user@alpha.example')).toThrow(
      'SELF_HOSTED_OIDC_TEAM_DOMAIN_MAP must contain comma-separated <domain>:<team-url> entries',
    );
  });
});
