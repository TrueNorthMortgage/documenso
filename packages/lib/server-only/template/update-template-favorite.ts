import { prisma } from '@documenso/prisma';
import { EnvelopeType, TemplateType } from '@prisma/client';

import { TEAM_DOCUMENT_VISIBILITY_MAP } from '../../constants/teams';
import { AppError, AppErrorCode } from '../../errors/app-error';
import { getMemberRoles } from '../team/get-member-roles';
import { getTeamById } from '../team/get-team';

export type UpdateTemplateFavoriteOptions = {
  userId: number;
  teamId: number;
  envelopeId: string;
  isFavorite: boolean;
};

export const updateTemplateFavorite = async ({
  userId,
  teamId,
  envelopeId,
  isFavorite,
}: UpdateTemplateFavoriteOptions) => {
  const [team, { teamRole }] = await Promise.all([
    getTeamById({ teamId, userId }),
    getMemberRoles({ teamId, reference: { type: 'User', id: userId } }),
  ]);
  const visibility = TEAM_DOCUMENT_VISIBILITY_MAP[teamRole];

  const template = await prisma.envelope.findFirst({
    where: {
      id: envelopeId,
      type: EnvelopeType.TEMPLATE,
      OR: [
        { teamId, OR: [{ visibility: { in: visibility } }, { userId }] },
        {
          templateType: TemplateType.ORGANISATION,
          team: { organisationId: team.organisationId },
          visibility: { in: visibility },
        },
      ],
    },
    select: { id: true },
  });

  if (!template) {
    throw new AppError(AppErrorCode.NOT_FOUND, { message: 'Template not found' });
  }

  if (isFavorite) {
    await prisma.templateFavorite.upsert({
      where: { userId_envelopeId: { userId, envelopeId } },
      create: { userId, envelopeId },
      update: {},
    });
  } else {
    await prisma.templateFavorite.deleteMany({ where: { userId, envelopeId } });
  }

  return { isFavorite };
};
