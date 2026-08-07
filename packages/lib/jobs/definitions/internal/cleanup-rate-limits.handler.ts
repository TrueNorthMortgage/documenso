import { prisma } from '@documenso/prisma';
import { DateTime } from 'luxon';

import { deleteFile } from '../../../universal/upload/delete-file';
import type { JobRunIO } from '../../client/_internal/job';
import type { TCleanupRateLimitsJobDefinition } from './cleanup-rate-limits';

const BATCH_SIZE = 10_000;

export const run = async ({ io }: { payload: TCleanupRateLimitsJobDefinition; io: JobRunIO }) => {
  const cutoff = DateTime.now().minus({ hours: 24 }).toJSDate();

  let totalDeleted = 0;
  let deleted = 0;

  do {
    // Prisma doesn't support DELETE with LIMIT, so use raw SQL for batching
    // to avoid long-running transactions that could lock the table.
    deleted = await prisma.$executeRaw`
      DELETE FROM "RateLimit"
      WHERE ctid IN (
        SELECT ctid FROM "RateLimit"
        WHERE "createdAt" < ${cutoff}
        LIMIT ${BATCH_SIZE}
      )
    `;

    totalDeleted += deleted;
  } while (deleted >= BATCH_SIZE);

  if (totalDeleted > 0) {
    io.logger.info(`Cleaned up ${totalDeleted} expired rate limit entries`);
  } else {
    io.logger.info('No expired rate limit entries to clean up');
  }

  const expiredPendingPreparations = await prisma.pendingPreparation.findMany({
    where: {
      status: { in: ['PENDING', 'EXPIRED'] },
      expiresAt: { lt: new Date() },
    },
    select: {
      id: true,
      documents: {
        select: {
          documentData: {
            select: {
              id: true,
              type: true,
              data: true,
              envelopeItem: { select: { id: true } },
            },
          },
        },
      },
    },
  });

  let cleanedPendingPreparations = 0;

  for (const pendingPreparation of expiredPendingPreparations) {
    let cleanupFailed = false;

    for (const document of pendingPreparation.documents) {
      const documentData = document.documentData;

      if (documentData.envelopeItem) {
        cleanupFailed = true;
        io.logger.warn(
          {
            pendingPreparationId: pendingPreparation.id,
            documentDataId: documentData.id,
            envelopeItemId: documentData.envelopeItem.id,
          },
          'Skipped pending preparation data referenced by an envelope item',
        );
        continue;
      }

      try {
        await deleteFile({ type: documentData.type, data: documentData.data });
        await prisma.documentData.delete({ where: { id: documentData.id } });
      } catch (error) {
        cleanupFailed = true;
        io.logger.error(
          {
            err: error,
            pendingPreparationId: pendingPreparation.id,
            documentDataId: documentData.id,
          },
          'Failed to clean up pending preparation document data',
        );
      }
    }

    if (!cleanupFailed) {
      await prisma.pendingPreparation.delete({ where: { id: pendingPreparation.id } });
      cleanedPendingPreparations += 1;
    }
  }

  if (cleanedPendingPreparations > 0) {
    io.logger.info(`Cleaned up ${cleanedPendingPreparations} expired pending preparations`);
  } else if (expiredPendingPreparations.length === 0) {
    io.logger.info('No expired pending preparations to clean up');
  }
};
