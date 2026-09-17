import { DocumentStatus, EnvelopeType } from '@prisma/client';

import { AppError, AppErrorCode } from '../../errors/app-error';

export const assertEnvelopeCanBeCorrected = (envelope: {
  type: EnvelopeType;
  status: DocumentStatus;
  internalVersion: number;
  correctionStartedAt: Date | null;
}) => {
  if (
    envelope.type === EnvelopeType.DOCUMENT &&
    envelope.internalVersion === 2 &&
    envelope.status === DocumentStatus.PENDING &&
    !envelope.correctionStartedAt
  ) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Start a correction before changing a pending envelope',
    });
  }
};
