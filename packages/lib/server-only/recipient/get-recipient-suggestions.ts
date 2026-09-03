import { buildTeamWhereQuery } from '@documenso/lib/utils/teams';
import { prisma } from '@documenso/prisma';
import { EnvelopeType, Prisma } from '@prisma/client';

import { getTeamById } from '../team/get-team';

export type GetRecipientSuggestionsOptions = {
  userId: number;
  teamId: number;
  query: string;
};

export const getRecipientSuggestions = async ({ userId, teamId, query }: GetRecipientSuggestionsOptions) => {
  const trimmedQuery = query.trim();

  const nameEmailFilter = trimmedQuery
    ? {
        OR: [
          {
            name: {
              contains: trimmedQuery,
              mode: Prisma.QueryMode.insensitive,
            },
          },
          {
            email: {
              contains: trimmedQuery,
              mode: Prisma.QueryMode.insensitive,
            },
          },
        ],
      }
    : {};

  const team = await getTeamById({ teamId, userId });

  const recipients = await prisma.recipient.findMany({
    where: {
      envelope: {
        type: EnvelopeType.DOCUMENT,
        userId,
        team: buildTeamWhereQuery({ teamId, userId }),
      },
      ...nameEmailFilter,
    },
    select: {
      name: true,
      email: true,
      envelope: {
        select: {
          createdAt: true,
        },
      },
    },
    distinct: ['email'],
    orderBy: {
      envelope: {
        createdAt: 'desc',
      },
    },
    take: 5,
  });

  const organisationMembers = await prisma.organisationMember.findMany({
    where: {
      organisationId: team.organisationId,
      user: {
        ...nameEmailFilter,
        ...(recipients.length > 0
          ? {
              email: {
                notIn: recipients.map(({ email }) => email),
                mode: Prisma.QueryMode.insensitive,
              },
            }
          : {}),
      },
    },
    select: {
      user: {
        select: {
          email: true,
          name: true,
        },
      },
    },
    orderBy: {
      user: {
        name: 'asc',
      },
    },
    take: 5,
  });

  const suggestions = [
    ...recipients.map(({ name, email }) => ({ name, email })),
    ...organisationMembers.map(({ user }) => user),
  ];

  return suggestions
    .filter((suggestion, index, allSuggestions) => {
      return (
        allSuggestions.findIndex((candidate) => candidate.email.toLowerCase() === suggestion.email.toLowerCase()) ===
        index
      );
    })
    .slice(0, 5);
};
