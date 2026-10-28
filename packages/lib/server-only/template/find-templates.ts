import { prisma } from '@documenso/prisma';
import type { TemplateType } from '@prisma/client';

import { TEAM_DOCUMENT_VISIBILITY_MAP } from '../../constants/teams';
import type { FindResultResponse } from '../../types/search-params';
import { getFolderPaths } from '../folder/get-folder-paths';
import { getMemberRoles } from '../team/get-member-roles';
import { getTeamById } from '../team/get-team';
import { findRankedTemplateIds } from './find-ranked-template-ids';

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

  const { rows, count } = await findRankedTemplateIds({
    userId,
    teamId,
    visibility: TEAM_DOCUMENT_VISIBILITY_MAP[teamRole],
    type,
    folderId,
    includeAllFolders,
    query,
    page,
    perPage,
  });

  const templates = await prisma.envelope.findMany({
    where: { id: { in: rows.map((row) => row.id) } },
    include: templateInclude,
  });
  const templatesById = new Map(templates.map((template) => [template.id, template]));
  const data = rows.flatMap((row) => {
    const template = templatesById.get(row.id);
    return template ? [{ ...template, isFavorite: row.isFavorite }] : [];
  });

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
