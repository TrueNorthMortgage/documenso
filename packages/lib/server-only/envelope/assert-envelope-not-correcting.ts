import { AppError, AppErrorCode } from '../../errors/app-error';

export const assertEnvelopeNotCorrecting = (envelope: { correctionStartedAt: Date | null }) => {
  if (envelope.correctionStartedAt) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Envelope correction is in progress',
      userMessage: 'This document is currently being corrected by the owner. Please try again later.',
      statusCode: 409,
    });
  }
};
