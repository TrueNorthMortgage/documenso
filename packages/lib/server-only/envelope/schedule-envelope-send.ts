import { prisma } from '@documenso/prisma';
import { DocumentStatus, EnvelopeType } from '@prisma/client';

import { AppError, AppErrorCode } from '../../errors/app-error';
import type { EnvelopeIdOptions } from '../../utils/envelope';
import { getEnvelopeWhereInput } from './get-envelope-by-id';

type ScheduleEnvelopeSendOptions = {
  id: EnvelopeIdOptions;
  userId: number;
  teamId: number;
  scheduledSendAt: Date;
};

export const scheduleEnvelopeSend = async ({ id, userId, teamId, scheduledSendAt }: ScheduleEnvelopeSendOptions) => {
  const now = new Date();

  if (scheduledSendAt <= now) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Scheduled send time must be in the future.',
      userMessage: 'Choose a date and time in the future.',
    });
  }

  const { envelopeWhereInput } = await getEnvelopeWhereInput({ id, userId, teamId, type: EnvelopeType.DOCUMENT });
  const envelope = await prisma.envelope.findFirst({
    where: envelopeWhereInput,
    select: { id: true, userId: true, status: true },
  });

  if (!envelope || envelope.userId !== userId) {
    throw new AppError(AppErrorCode.NOT_FOUND, { message: 'Envelope could not be found.' });
  }

  if (envelope.status !== DocumentStatus.DRAFT) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, { message: 'Only draft envelopes can be scheduled.' });
  }

  return await prisma.envelope.update({ where: { id: envelope.id }, data: { scheduledSendAt } });
};

export const cancelScheduledEnvelopeSend = async ({
  id,
  userId,
  teamId,
}: Omit<ScheduleEnvelopeSendOptions, 'scheduledSendAt'>) => {
  const now = new Date();
  const { envelopeWhereInput } = await getEnvelopeWhereInput({ id, userId, teamId, type: EnvelopeType.DOCUMENT });
  const envelope = await prisma.envelope.findFirst({
    where: envelopeWhereInput,
    select: { id: true, userId: true, status: true, scheduledSendAt: true },
  });

  if (!envelope || envelope.userId !== userId) {
    throw new AppError(AppErrorCode.NOT_FOUND, { message: 'Envelope could not be found.' });
  }

  if (envelope.status !== DocumentStatus.DRAFT || !envelope.scheduledSendAt || envelope.scheduledSendAt <= now) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, { message: 'This scheduled send can no longer be cancelled.' });
  }

  return await prisma.envelope.update({ where: { id: envelope.id }, data: { scheduledSendAt: null } });
};
