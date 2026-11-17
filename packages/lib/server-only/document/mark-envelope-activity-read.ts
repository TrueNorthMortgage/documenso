import { prisma } from '@documenso/prisma';
import { EnvelopeType } from '@prisma/client';

import { getTeamById } from '../team/get-team';

export const markEnvelopeActivityRead = async ({
  userId,
  teamId,
  eventIds,
}: {
  userId: number;
  teamId: number;
  eventIds: string[];
}) => {
  const team = await getTeamById({ userId, teamId });
  const events = await prisma.documentAuditLog.findMany({
    where: {
      id: { in: eventIds },
      envelope: { userId, teamId: team.id, type: EnvelopeType.DOCUMENT, deletedAt: null },
    },
    select: { id: true },
  });

  await prisma.envelopeActivityRead.createMany({
    data: events.map(({ id }) => ({ userId, auditLogId: id })),
    skipDuplicates: true,
  });

  return { success: true };
};
