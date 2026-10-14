import type { Envelope, Prisma } from '@prisma/client';
import { EnvelopeType, RecipientRole, SendStatus, SigningStatus } from '@prisma/client';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { nanoid } from '../../universal/id';

// Bound recipient creation from untrusted PDF text.
const MAX_PLACEHOLDER_RECIPIENT_INDEX = 1000;

export const createMissingPlaceholderRecipients = async ({
  tx,
  envelopeId,
  placeholders,
}: {
  tx: Prisma.TransactionClient;
  envelopeId: string;
  placeholders: { recipient: string }[];
}) => {
  let highestRecipientIndex = 0;
  for (const placeholder of placeholders) {
    const match = /^r(\d+)$/i.exec(placeholder.recipient);
    const index = match ? Number(match[1]) : 0;
    if (!Number.isSafeInteger(index) || index < 1 || index > MAX_PLACEHOLDER_RECIPIENT_INDEX) {
      throw new AppError(AppErrorCode.INVALID_BODY, {
        message: `Recipient placeholders must use r1 through r${MAX_PLACEHOLDER_RECIPIENT_INDEX}.`,
      });
    }
    highestRecipientIndex = Math.max(highestRecipientIndex, index);
  }

  // Serialize placeholder imports for the same envelope to avoid duplicate slots.
  const [envelope] = await tx.$queryRaw<Pick<Envelope, 'type' | 'correctionStartedAt'>[]>`
    SELECT "type", "correctionStartedAt" FROM "Envelope" WHERE id = ${envelopeId} FOR UPDATE
  `;

  if (!envelope) {
    throw new AppError(AppErrorCode.NOT_FOUND, { message: 'Envelope not found' });
  }
  const recipients = await tx.recipient.findMany({
    where: { envelopeId },
    orderBy: [{ signingOrder: 'asc' }, { id: 'asc' }],
  });

  if (highestRecipientIndex <= recipients.length) {
    return { recipients, addedRecipients: [] };
  }

  if (envelope.type === EnvelopeType.DOCUMENT && envelope.correctionStartedAt) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Placeholder recipients cannot be created while correcting a document',
      userMessage:
        'This PDF contains placeholders for new recipients. Recipients cannot be added in Correct mode. Update the placeholders to use existing recipients, then upload the PDF again.',
      statusCode: 400,
    });
  }

  const addedRecipients = await tx.recipient.createManyAndReturn({
    data: Array.from({ length: highestRecipientIndex - recipients.length }, (_, index) => ({
      envelopeId,
      name: `Recipient ${recipients.length + index + 1}`,
      email: '',
      role: RecipientRole.SIGNER,
      // Null sorts after existing ordered recipients; IDs preserve appended slots.
      signingOrder: null,
      token: nanoid(),
      sendStatus: SendStatus.NOT_SENT,
      signingStatus: SigningStatus.NOT_SIGNED,
    })),
  });
  addedRecipients.sort((a, b) => a.id - b.id);
  return { recipients: [...recipients, ...addedRecipients], addedRecipients };
};
