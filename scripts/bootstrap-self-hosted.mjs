import { SALT_ROUNDS } from '/app/apps/remix/build/server/hono/packages/lib/constants/auth.js';
import { hashString } from '/app/apps/remix/build/server/hono/packages/lib/server-only/auth/hash.js';
import { createOrganisation } from '/app/apps/remix/build/server/hono/packages/lib/server-only/organisation/create-organisation.js';
import { createTeam } from '/app/apps/remix/build/server/hono/packages/lib/server-only/team/create-team.js';
import { createUser } from '/app/apps/remix/build/server/hono/packages/lib/server-only/user/create-user.js';
import {
  INTERNAL_CLAIM_ID,
  internalClaims,
} from '/app/apps/remix/build/server/hono/packages/lib/types/subscription.js';
import { generateDatabaseId } from '/app/apps/remix/build/server/hono/packages/lib/universal/id.js';
import { prisma as prismaWithReplicas } from '/app/apps/remix/build/server/hono/packages/prisma/index.js';
import { hash } from '/app/node_modules/@node-rs/bcrypt/index.js';

const requiredEnv = (name) => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
};

const splitSpec = (value, separator, expected_count, name) => {
  const parts = value.split(separator).map((part) => part.trim());

  if (parts.length < expected_count || parts.some((part) => !part)) {
    throw new Error(`${name} contains an invalid entry: ${value}`);
  }

  return parts;
};

const parseTeams = (value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [team_url, ...name_parts] = splitSpec(item, ':', 2, 'SELF_HOSTED_BOOTSTRAP_TEAMS');

      return {
        team_url,
        team_name: name_parts.join(':').trim(),
      };
    });

const parseApiTokens = (value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [token_env, team_url, ...name_parts] = splitSpec(item, ':', 3, 'SELF_HOSTED_BOOTSTRAP_API_TOKENS');

      return {
        token_env,
        team_url,
        token_name: name_parts.join(':').trim(),
      };
    });

const ensureAdminUser = async () => {
  const admin_email = requiredEnv('SELF_HOSTED_BOOTSTRAP_ADMIN_EMAIL').toLowerCase();
  const admin_password = requiredEnv('SELF_HOSTED_BOOTSTRAP_ADMIN_PASSWORD');
  const admin_name = requiredEnv('SELF_HOSTED_BOOTSTRAP_ADMIN_NAME');

  const existing_user = await prismaWithReplicas.user.findFirst({
    where: {
      email: admin_email,
    },
  });

  const hashed_password = await hash(admin_password, SALT_ROUNDS);

  if (existing_user) {
    return await prismaWithReplicas.user.update({
      where: {
        id: existing_user.id,
      },
      data: {
        name: existing_user.name || admin_name,
        password: hashed_password,
        emailVerified: existing_user.emailVerified || new Date(),
        disabled: false,
      },
    });
  }

  const user = await createUser({
    name: admin_name,
    email: admin_email,
    password: admin_password,
  });

  return await prismaWithReplicas.user.update({
    where: {
      id: user.id,
    },
    data: {
      emailVerified: new Date(),
    },
  });
};

const ensureOrganisation = async (user) => {
  const organisation_name = requiredEnv('SELF_HOSTED_BOOTSTRAP_ORGANISATION_NAME');
  const organisation_url = requiredEnv('SELF_HOSTED_BOOTSTRAP_ORGANISATION_URL');

  const existing_organisation = await prismaWithReplicas.organisation.findFirst({
    where: {
      url: organisation_url,
    },
  });

  if (existing_organisation) {
    return existing_organisation;
  }

  return await createOrganisation({
    name: organisation_name,
    url: organisation_url,
    type: 'ORGANISATION',
    userId: user.id,
    claim: internalClaims[INTERNAL_CLAIM_ID.FREE],
  });
};

const ensureAdminMembership = async (user, organisation) => {
  const admin_group = await prismaWithReplicas.organisationGroup.findFirst({
    where: {
      organisationId: organisation.id,
      type: 'INTERNAL_ORGANISATION',
      organisationRole: 'ADMIN',
    },
    select: {
      id: true,
    },
  });

  if (!admin_group) {
    throw new Error(`Admin group not found for organisation ${organisation.url}`);
  }

  await prismaWithReplicas.$transaction(async (tx) => {
    let organisation_member = await tx.organisationMember.findFirst({
      where: {
        userId: user.id,
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
          userId: user.id,
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
        groupId: admin_group.id,
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
          groupId: admin_group.id,
        },
      });
    }
  });
};

const ensureTeam = async ({ user, organisation, team_name, team_url }) => {
  const existing_team = await prismaWithReplicas.team.findFirst({
    where: {
      organisationId: organisation.id,
      url: team_url,
    },
  });

  if (existing_team) {
    return existing_team;
  }

  await createTeam({
    userId: user.id,
    teamName: team_name,
    teamUrl: team_url,
    organisationId: organisation.id,
    inheritMembers: false,
  });

  return await prismaWithReplicas.team.findFirstOrThrow({
    where: {
      organisationId: organisation.id,
      url: team_url,
    },
  });
};

const ensureApiToken = async ({ user, team, token_name, token_value }) => {
  const hashed_token = hashString(token_value);
  const existing_token = await prismaWithReplicas.apiToken.findFirst({
    where: {
      token: hashed_token,
    },
  });

  if (existing_token) {
    return await prismaWithReplicas.apiToken.update({
      where: {
        id: existing_token.id,
      },
      data: {
        name: token_name,
        userId: user.id,
        teamId: team.id,
      },
    });
  }

  return await prismaWithReplicas.apiToken.create({
    data: {
      name: token_name,
      token: hashed_token,
      algorithm: 'SHA512',
      userId: user.id,
      teamId: team.id,
    },
  });
};

const team_specs = parseTeams(requiredEnv('SELF_HOSTED_BOOTSTRAP_TEAMS'));
const api_token_specs = parseApiTokens(requiredEnv('SELF_HOSTED_BOOTSTRAP_API_TOKENS'));

const user = await ensureAdminUser();
const organisation = await ensureOrganisation(user);

await ensureAdminMembership(user, organisation);

const teams_by_url = new Map();

for (const team_spec of team_specs) {
  const team = await ensureTeam({
    user,
    organisation,
    team_name: team_spec.team_name,
    team_url: team_spec.team_url,
  });

  teams_by_url.set(team.url, team);
}

const api_tokens = [];

for (const api_token_spec of api_token_specs) {
  const team = teams_by_url.get(api_token_spec.team_url);

  if (!team) {
    throw new Error(`API token team was not bootstrapped: ${api_token_spec.team_url}`);
  }

  const api_token = await ensureApiToken({
    user,
    team,
    token_name: api_token_spec.token_name,
    token_value: requiredEnv(api_token_spec.token_env),
  });

  api_tokens.push(api_token);
}

console.log(
  JSON.stringify(
    {
      status: 'ok',
      admin: {
        id: user.id,
        email: user.email,
      },
      organisation: {
        id: organisation.id,
        url: organisation.url,
      },
      teams: Array.from(teams_by_url.values()).map((team) => ({
        id: team.id,
        url: team.url,
      })),
      apiTokens: api_tokens.map((api_token) => ({
        id: api_token.id,
        name: api_token.name,
        teamId: api_token.teamId,
      })),
    },
    null,
    2,
  ),
);
