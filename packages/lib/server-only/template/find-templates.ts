import { prisma } from '@documenso/prisma';
import type { TemplateType } from '@prisma/client';
import { EnvelopeType, type Prisma } from '@prisma/client';

import { TEAM_DOCUMENT_VISIBILITY_MAP } from '../../constants/teams';
import type { FindResultResponse } from '../../types/search-params';
import { getFolderPaths } from '../folder/get-folder-paths';
import { getMemberRoles } from '../team/get-member-roles';
import { getTeamById } from '../team/get-team';

export type FindTemplatesOptions = {
  userId: number;
  teamId: number;
  type?: TemplateType;
  page?: number;
  perPage?: number;
  folderId?: string;
  includeAllFolders?: boolean;
  query?: string;
};

export const findTemplates = async ({
  userId,
  teamId,
  type,
  page = 1,
  perPage = 10,
  folderId,
  includeAllFolders = false,
  query,
}: FindTemplatesOptions) => {
  const [team, { teamRole }] = await Promise.all([
    getTeamById({ teamId, userId }),
    getMemberRoles({
      teamId,
      reference: {
        type: 'User',
        id: userId,
      },
    }),
  ]);

  const where: Prisma.EnvelopeWhereInput = {
    type: EnvelopeType.TEMPLATE,
    templateType: type,
    AND: [
      { teamId },
      {
        OR: [
          {
            visibility: {
              in: TEAM_DOCUMENT_VISIBILITY_MAP[teamRole],
            },
          },
          { userId, teamId },
        ],
      },
      ...(includeAllFolders ? [] : [folderId ? { folderId } : { folderId: null }]),
      query?.trim()
        ? {
            title: {
              contains: query.trim(),
              mode: 'insensitive',
            },
          }
        : {},
    ],
  };

  const templateInclude = {
    team: {
      select: {
        id: true,
        url: true,
        name: true,
      },
    },
    fields: true,
    recipients: true,
    envelopeItems: {
      select: {
        id: true,
        envelopeId: true,
      },
    },
    documentMeta: true,
    directLink: {
      select: {
        token: true,
        enabled: true,
      },
    },
  } as const;

  const [data, count] = await Promise.all([
    prisma.envelope.findMany({
      where,
      include: templateInclude,
      skip: Math.max(page - 1, 0) * perPage,
      take: perPage,
      orderBy: {
        createdAt: 'desc',
      },
    }),
    prisma.envelope.count({ where }),
  ]);

  const folderPaths = await getFolderPaths(data.flatMap((template) => (template.folderId ? [template.folderId] : [])));

  const dataWithFolderPaths = data.map((template) => ({
    ...template,
    templatePath: [
      team.organisation.name,
      template.team?.name,
      template.folderId ? folderPaths.get(template.folderId) : null,
    ]
      .filter((path): path is string => Boolean(path))
      .join(' / '),
  }));

  return {
    data: dataWithFolderPaths,
    count,
    currentPage: Math.max(page, 1),
    perPage,
    totalPages: Math.ceil(count / perPage),
  } satisfies FindResultResponse<typeof data>;
};
