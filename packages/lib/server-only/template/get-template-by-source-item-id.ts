import { prisma } from '@documenso/prisma';

import { AppError, AppErrorCode } from '../../errors/app-error';

import { getOrganisationTemplateById } from './get-organisation-template-by-id';
import { getTemplateById } from './get-template-by-id';

export type GetTemplateBySourceItemIdOptions = {
  envelopeItemId: string;
  userId: number;
  teamId: number;
};

export const getTemplateBySourceItemId = async ({
  envelopeItemId,
  userId,
  teamId,
}: GetTemplateBySourceItemIdOptions) => {
  const sourceItem = await prisma.envelopeItem.findUnique({
    where: {
      id: envelopeItemId,
    },
    select: {
      envelopeId: true,
    },
  });

  if (!sourceItem) {
    return null;
  }

  try {
    const template = await getTemplateById({
      id: { type: 'envelopeId', id: sourceItem.envelopeId },
      userId,
      teamId,
    });

    return {
      envelopeId: template.envelopeId,
      title: template.title,
    };
  } catch (error) {
    const appError = AppError.parseError(error);

    if (appError.code !== AppErrorCode.NOT_FOUND) {
      throw error;
    }
  }

  try {
    const template = await getOrganisationTemplateById({
      id: { type: 'envelopeId', id: sourceItem.envelopeId },
      userId,
      teamId,
    });

    return {
      envelopeId: template.id,
      title: template.title,
    };
  } catch (error) {
    const appError = AppError.parseError(error);

    if (appError.code === AppErrorCode.NOT_FOUND) {
      return null;
    }

    throw error;
  }
};
