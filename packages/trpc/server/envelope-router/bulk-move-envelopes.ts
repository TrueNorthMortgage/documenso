import { TEAM_DOCUMENT_VISIBILITY_MAP } from '@documenso/lib/constants/teams';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { getMultipleEnvelopeWhereInput } from '@documenso/lib/server-only/envelope/get-envelopes-by-ids';
import { assertCanManageTemplates } from '@documenso/lib/server-only/template/validate-template-access';
import { buildTeamWhereQuery } from '@documenso/lib/utils/teams';
import { prisma } from '@documenso/prisma';
import { EnvelopeType } from '@prisma/client';

import { authenticatedProcedure } from '../trpc';
import { ZBulkMoveEnvelopesRequestSchema, ZBulkMoveEnvelopesResponseSchema } from './bulk-move-envelopes.types';

export const bulkMoveEnvelopesRoute = authenticatedProcedure
  // .meta(bulkMoveEnvelopesMeta)
  .input(ZBulkMoveEnvelopesRequestSchema)
  .output(ZBulkMoveEnvelopesResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { teamId, user } = ctx;
    const { envelopeIds, envelopeType, folderId } = input;

    ctx.logger.info({
      input: {
        envelopeIds,
        envelopeType,
        folderId,
      },
    });

    // Build the where input for the update query.
    const { envelopeWhereInput, team } = await getMultipleEnvelopeWhereInput({
      ids: {
        type: 'envelopeId',
        ids: envelopeIds,
      },
      userId: user.id,
      teamId,
      type: envelopeType,
    });

    // Validate folder access if moving to a folder (not root).
    if (folderId) {
      const folder = await prisma.folder.findFirst({
        where: {
          id: folderId,
          team: buildTeamWhereQuery({
            teamId,
            userId: user.id,
          }),
          type: envelopeType,
          OR: [
            {
              visibility: {
                in: TEAM_DOCUMENT_VISIBILITY_MAP[team.currentTeamRole],
              },
            },
            { userId: user.id },
          ],
        },
      });

      if (!folder) {
        throw new AppError(AppErrorCode.NOT_FOUND, {
          message: 'Folder not found or access denied',
        });
      }
    }

    if (envelopeType === EnvelopeType.TEMPLATE) {
      const templates = await prisma.envelope.findMany({
        where: envelopeWhereInput,
        select: {
          userId: true,
        },
      });

      assertCanManageTemplates({
        templateOwnerIds: templates.map(({ userId }) => userId),
        currentTeamRole: team.currentTeamRole,
        userId: user.id,
      });
    }

    const result = await prisma.envelope.updateMany({
      where: envelopeWhereInput,
      data: {
        folderId: folderId,
      },
    });

    return {
      movedCount: result.count,
    };
  });
