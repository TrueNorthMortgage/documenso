import { generateDatabaseId } from '@documenso/lib/universal/id';
import { env } from '@documenso/lib/utils/env';
import { prisma } from '@documenso/prisma';

const VALID_ROLES = new Set(['ADMIN', 'MANAGER', 'MEMBER']);

type AutoProvisionResult =
  | {
      provisioned: false;
      teamUrl?: undefined;
    }
  | {
      provisioned: true;
      teamUrl: string;
    };

const getRequiredEnv = (name: string) => {
  const value = env(name)?.trim();

  if (!value) {
    throw new Error(`${name} is required when OIDC auto-provisioning is enabled`);
  }

  return value;
};

const stringList = (value: string | undefined) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const getEmailDomain = (email: string) => {
  const parts = email.toLowerCase().split('@');

  return parts.length === 2 ? parts[1] : '';
};

const getRole = (name: string) => {
  const role = getRequiredEnv(name).toUpperCase();

  if (!VALID_ROLES.has(role)) {
    throw new Error(`${name} must be one of ${Array.from(VALID_ROLES).join(', ')}`);
  }

  return role;
};

const isEnabled = () => env('SELF_HOSTED_OIDC_AUTO_PROVISION_ENABLED') === 'true';

const shouldProvisionEmail = (email: string) => {
  const domains = stringList(getRequiredEnv('SELF_HOSTED_OIDC_AUTO_PROVISION_DOMAINS'));

  return domains.includes(getEmailDomain(email));
};

export const provisionOidcUser = async ({
  userId,
  email,
}: {
  userId: string;
  email: string;
}): Promise<AutoProvisionResult> => {
  if (!isEnabled()) {
    return { provisioned: false };
  }

  if (!shouldProvisionEmail(email)) {
    return { provisioned: false };
  }

  const organisation_url = getRequiredEnv('SELF_HOSTED_OIDC_DEFAULT_ORGANISATION_URL');
  const team_url = getRequiredEnv('SELF_HOSTED_OIDC_DEFAULT_TEAM_URL');
  const organisation_role = getRole('SELF_HOSTED_OIDC_DEFAULT_ORGANISATION_ROLE');
  const team_role = getRole('SELF_HOSTED_OIDC_DEFAULT_TEAM_ROLE');

  const organisation = await prisma.organisation.findFirst({
    where: {
      url: organisation_url,
    },
    select: {
      id: true,
      url: true,
    },
  });

  if (!organisation) {
    throw new Error(`OIDC auto-provision organisation not found: ${organisation_url}`);
  }

  const team = await prisma.team.findFirst({
    where: {
      organisationId: organisation.id,
      url: team_url,
    },
    select: {
      id: true,
      url: true,
    },
  });

  if (!team) {
    throw new Error(`OIDC auto-provision team not found: ${organisation_url}/${team_url}`);
  }

  const target_group = await prisma.organisationGroup.findFirst({
    where: {
      organisationId: organisation.id,
      type: 'INTERNAL_TEAM',
      organisationRole: organisation_role,
      teamGroups: {
        some: {
          teamId: team.id,
          teamRole: team_role,
        },
      },
    },
    select: {
      id: true,
    },
  });

  if (!target_group) {
    throw new Error(`OIDC auto-provision group not found: ${organisation_url}/${team_url}/${team_role}`);
  }

  await prisma.$transaction(async (tx) => {
    let organisation_member = await tx.organisationMember.findFirst({
      where: {
        userId,
        organisationId: organisation.id,
      },
      select: {
        id: true,
      },
    });

    if (!organisation_member) {
      organisation_member = await tx.organisationMember.create({
        data: {
          id: generateDatabaseId('member'),
          userId,
          organisationId: organisation.id,
        },
        select: {
          id: true,
        },
      });
    }

    const existing_group_member = await tx.organisationGroupMember.findFirst({
      where: {
        organisationMemberId: organisation_member.id,
        groupId: target_group.id,
      },
      select: {
        id: true,
      },
    });

    if (!existing_group_member) {
      await tx.organisationGroupMember.create({
        data: {
          id: generateDatabaseId('group_member'),
          organisationMemberId: organisation_member.id,
          groupId: target_group.id,
        },
      });
    }
  });

  return {
    provisioned: true,
    teamUrl: team.url,
  };
};

export const getAutoProvisionRedirectPath = (redirectPath: string, provisioning: AutoProvisionResult) => {
  if (
    env('SELF_HOSTED_OIDC_AUTO_PROVISION_REDIRECT_TO_TEAM') !== 'true' ||
    !provisioning.provisioned ||
    !provisioning.teamUrl ||
    redirectPath !== '/'
  ) {
    return redirectPath;
  }

  return `/t/${provisioning.teamUrl}`;
};
