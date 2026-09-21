import { prisma } from '@documenso/prisma';
import { DocumentStatus, Prisma } from '@prisma/client';

import { sendDocument } from '../../../server-only/document/send-document';
import type { JobRunIO } from '../../client/_internal/job';
import type { TSendScheduledEnvelopesSweepJobDefinition } from './send-scheduled-envelopes-sweep';

export const run = async ({ io }: { payload: TSendScheduledEnvelopesSweepJobDefinition; io: JobRunIO }) => {
  const now = new Date();

  // Claim a bounded batch under row locks. `SKIP LOCKED` means concurrent sweep
  // instances receive distinct envelopes without waiting on one another.
  const dueEnvelopes = await prisma.$transaction(async (tx) => {
    const envelopes = await tx.$queryRaw<{ id: string; userId: number; teamId: number }[]>(Prisma.sql`
      SELECT "id", "userId", "teamId"
      FROM "Envelope"
      WHERE "status" = ${DocumentStatus.DRAFT}
        AND "scheduledSendAt" <= ${now}
        AND "deletedAt" IS NULL
      ORDER BY "scheduledSendAt", "id"
      LIMIT 100
      FOR UPDATE SKIP LOCKED
    `);

    if (envelopes.length === 0) {
      return envelopes;
    }

    await tx.envelope.updateMany({
      where: {
        id: { in: envelopes.map((envelope) => envelope.id) },
        status: DocumentStatus.DRAFT,
        scheduledSendAt: { lte: now },
        deletedAt: null,
      },
      data: { scheduledSendAt: null },
    });

    return envelopes;
  });

  await Promise.allSettled(
    dueEnvelopes.map(async (envelope) => {
      try {
        await sendDocument({
          id: { type: 'envelopeId', id: envelope.id },
          userId: envelope.userId,
          teamId: envelope.teamId,
          requestMetadata: { requestMetadata: {}, source: 'app', auth: null },
        });
      } catch (error) {
        io.logger.error({ err: error, envelopeId: envelope.id }, 'Failed to send scheduled envelope');
      }
    }),
  );

  io.logger.info(`Processed ${dueEnvelopes.length} scheduled envelopes`);
};
