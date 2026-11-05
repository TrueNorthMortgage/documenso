import { createHash } from 'node:crypto';

import { prisma } from '@documenso/prisma';

type RecordRecentEmailMessageOptions = {
  teamId: number;
  userId: number;
  subject: string;
  message: string;
};

export const recordRecentEmailMessage = async ({
  teamId,
  userId,
  subject,
  message,
}: RecordRecentEmailMessageOptions) => {
  if (!subject.trim() && !message.trim()) {
    return;
  }

  const id = createHash('sha256')
    .update(JSON.stringify([teamId, userId, subject, message]))
    .digest('hex');
  const lastSentAt = new Date();

  await prisma.emailMessage.upsert({
    where: { id },
    create: { id, teamId, ownerId: userId, subject, message, lastSentAt },
    update: { lastSentAt },
  });
};
