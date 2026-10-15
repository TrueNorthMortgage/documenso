import { getEmailDomain, getOidcTeamUrlForEmail } from '@documenso/lib/server-only/auth/oidc-domain-map';
import { generateDatabaseId } from '@documenso/lib/universal/id';
import { env } from '@documenso/lib/utils/env';
import { prisma } from '@documenso/prisma';
import { OrganisationGroupType, OrganisationMemberRole, TeamMemberRole } from '@prisma/client';

export { getOidcTeamUrlForEmail } from '@documenso/lib/server-only/auth/oidc-domain-map';

const VALID_ORGANISATION_ROLES = new Set(Object.values(OrganisationMemberRole));
const VALID_TEAM_ROLES = new Set(Object.values(TeamMemberRole));

export type AutoProvisionResult =
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

const getOrganisationRole = (name: string) => {
  const role = getRequiredEnv(name).toUpperCase();

  if (!VALID_ORGANISATION_ROLES.has(role as OrganisationMemberRole)) {
    throw new Error(`${name} must be one of ${Array.from(VALID_ORGANISATION_ROLES).join(', ')}`);
  }

  return role as OrganisationMemberRole;
};

const getTeamRole = (name: string) => {
  const role = getRequiredEnv(name).toUpperCase();

  if (!VALID_TEAM_ROLES.has(role as TeamMemberRole)) {
    throw new Error(`${name} must be one of ${Array.from(VALID_TEAM_ROLES).join(', ')}`);
  }

  return role as TeamMemberRole;
};

const isEnabled = () => env('SELF_HOSTED_OIDC_AUTO_PROVISION_ENABLED') === 'true';

export const isOidcAutoProvisioningEnabled = () => isEnabled();

export const provisionOidcUser = async ({
  userId,
  email,
}: {
  userId: number;
  email: string;
}): Promise<AutoProvisionResult> => {
  if (!isEnabled()) {
    return { provisioned: false };
  }

  const team_url = getOidcTeamUrlForEmail(email);

  if (!team_url) {
    throw new Error(`OIDC auto-provision email domain is not mapped: ${getEmailDomain(email) || 'missing'}`);
  }

  const organisation_url = getRequiredEnv('SELF_HOSTED_OIDC_DEFAULT_ORGANISATION_URL');
  const organisation_role = getOrganisationRole('SELF_HOSTED_OIDC_DEFAULT_ORGANISATION_ROLE');
  const team_role = getTeamRole('SELF_HOSTED_OIDC_DEFAULT_TEAM_ROLE');

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

  const organisation_group = await prisma.organisationGroup.findFirst({
    where: {
      organisationId: organisation.id,
      type: OrganisationGroupType.INTERNAL_ORGANISATION,
      organisationRole: organisation_role,
    },
    select: {
      id: true,
    },
  });

  if (!organisation_group) {
    throw new Error(`OIDC auto-provision organisation group not found: ${organisation_url}/${organisation_role}`);
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

    const existing_organisation_group_member = await tx.organisationGroupMember.findFirst({
      where: {
        organisationMemberId: organisation_member.id,
        groupId: organisation_group.id,
      },
      select: {
        id: true,
      },
    });

    if (!existing_organisation_group_member) {
      await tx.organisationGroupMember.create({
        data: {
          id: generateDatabaseId('group_member'),
          organisationMemberId: organisation_member.id,
          groupId: organisation_group.id,
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

export const getAutoProvisionRedirectPath = (
  redirectPath: string,
  provisioning: AutoProvisionResult,
  hasPreferredTeam = false,
) => {
  if (
    hasPreferredTeam ||
    env('SELF_HOSTED_OIDC_AUTO_PROVISION_REDIRECT_TO_TEAM') !== 'true' ||
    !provisioning.provisioned ||
    !provisioning.teamUrl ||
    redirectPath !== '/'
  ) {
    return redirectPath;
  }

  return `/t/${provisioning.teamUrl}`;
};
