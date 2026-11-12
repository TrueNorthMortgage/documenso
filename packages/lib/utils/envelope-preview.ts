import { DocumentStatus } from '@prisma/client';

export const canShareEnvelopePreview = ({
  status,
  correctionStartedAt,
  deletedAt,
}: {
  status: DocumentStatus;
  correctionStartedAt: Date | null;
  deletedAt: Date | null;
}) =>
  !deletedAt &&
  ((status === DocumentStatus.DRAFT && correctionStartedAt === null) ||
    (status === DocumentStatus.PENDING && correctionStartedAt !== null));
