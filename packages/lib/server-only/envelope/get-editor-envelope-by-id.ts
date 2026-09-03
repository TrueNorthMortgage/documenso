import { getEnvelopeWhereInput } from '@documenso/lib/server-only/envelope/get-envelope-by-id';
import { getEnvelopeItemPageCounts } from '@documenso/lib/server-only/pdf/get-envelope-item-page-counts';
import { prisma } from '@documenso/prisma';
import type { EnvelopeType } from '@prisma/client';

import { AppError, AppErrorCode } from '../../errors/app-error';
import type { EnvelopeIdOptions } from '../../utils/envelope';
import { assertCanManageTemplate } from '../template/validate-template-access';

export type GetEditorEnvelopeByIdOptions = {
  id: EnvelopeIdOptions;

  /**
   * The validated team ID.
   */
  userId: number;

  /**
   * The unvalidated team ID.
   */
  teamId: number;

  /**
   * The type of envelope to get.
   *
   * Set to null to bypass check.
   */
  type: EnvelopeType | null;
};

export const getEditorEnvelopeById = async ({ id, userId, teamId, type }: GetEditorEnvelopeByIdOptions) => {
  const { envelopeWhereInput, team } = await getEnvelopeWhereInput({
    id,
    userId,
    teamId,
    type,
  });

  const envelope = await prisma.envelope.findFirst({
    where: envelopeWhereInput,
    include: {
      envelopeItems: {
        include: {
          documentData: true,
        },
        orderBy: {
          order: 'asc',
        },
      },
      folder: true,
      documentMeta: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      recipients: {
        orderBy: {
          id: 'asc',
        },
      },
      fields: {
        include: {
          conditionalChildRule: true,
          conditionalParentRules: true,
          fieldGroup: true,
        },
      },
      team: {
        select: {
          id: true,
          url: true,
          organisationId: true,
        },
      },
      directLink: {
        select: {
          directTemplateRecipientId: true,
          enabled: true,
          id: true,
          token: true,
        },
      },
      envelopeAttachments: {
        select: {
          id: true,
          type: true,
          label: true,
          data: true,
        },
      },
    },
  });

  if (!envelope) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Envelope could not be found',
    });
  }

  assertCanManageTemplate({
    envelopeType: envelope.type,
    templateOwnerId: envelope.userId,
    currentTeamRole: team.currentTeamRole,
    userId,
  });

  const pageCounts = await getEnvelopeItemPageCounts(envelope.envelopeItems).catch((error) => {
    console.error('Unable to determine envelope item page counts', error);

    return new Map<string, number>();
  });

  return {
    ...envelope,
    envelopeItems: envelope.envelopeItems.map((envelopeItem) => ({
      ...envelopeItem,
      pageCount: pageCounts.get(envelopeItem.id),
    })),
    attachments: envelope.envelopeAttachments,
    user: {
      id: envelope.user.id,
      name: envelope.user.name || '',
      email: envelope.user.email,
    },
  };
};
