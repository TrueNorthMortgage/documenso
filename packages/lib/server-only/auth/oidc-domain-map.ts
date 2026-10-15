import { AppError } from '../../errors/app-error';
import { env } from '../../utils/env';

const stringList = (value: string) =>
  value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

export const getEmailDomain = (email: string) => {
  const parts = email.trim().toLowerCase().split('@');

  return parts.length === 2 ? parts[1] : '';
};

const getTeamDomainMap = () => {
  const map = env('SELF_HOSTED_OIDC_TEAM_DOMAIN_MAP')?.trim();

  if (!map) {
    throw new AppError('INVALID_REQUEST', {
      message: 'SELF_HOSTED_OIDC_TEAM_DOMAIN_MAP is required when OIDC auto-provisioning is enabled',
    });
  }

  const entries = stringList(map);
  const team_by_domain = new Map<string, string>();

  for (const entry of entries) {
    const separator_index = entry.indexOf(':');

    if (separator_index <= 0 || separator_index === entry.length - 1) {
      throw new AppError('INVALID_REQUEST', {
        message: 'SELF_HOSTED_OIDC_TEAM_DOMAIN_MAP must contain comma-separated <domain>:<team-url> entries',
      });
    }

    const domain = entry.slice(0, separator_index).trim();
    const team_url = entry.slice(separator_index + 1).trim();

    if (!domain || !team_url || team_by_domain.has(domain)) {
      throw new AppError('INVALID_REQUEST', {
        message: `SELF_HOSTED_OIDC_TEAM_DOMAIN_MAP contains an invalid or duplicate domain: ${domain}`,
      });
    }

    team_by_domain.set(domain, team_url);
  }

  return team_by_domain;
};

export const getOidcTeamUrlForEmail = (email: string) => {
  const domain = getEmailDomain(email);

  return getTeamDomainMap().get(domain) ?? null;
};

export const isEmailDomainConfiguredForSso = (email: string) => {
  const isOidcEnabled = Boolean(
    env('NEXT_PRIVATE_OIDC_WELL_KNOWN') && env('NEXT_PRIVATE_OIDC_CLIENT_ID') && env('NEXT_PRIVATE_OIDC_CLIENT_SECRET'),
  );

  return (
    isOidcEnabled &&
    env('SELF_HOSTED_OIDC_AUTO_PROVISION_ENABLED') === 'true' &&
    Boolean(env('SELF_HOSTED_OIDC_TEAM_DOMAIN_MAP')?.trim()) &&
    getOidcTeamUrlForEmail(email) !== null
  );
};
