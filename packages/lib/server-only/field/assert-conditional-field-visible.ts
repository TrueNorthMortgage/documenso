import { prisma } from '@documenso/prisma';
import { AppError, AppErrorCode } from '../../errors/app-error';
import { getConditionalFieldVisibility } from '../../universal/conditional-field-visibility';

export const assertConditionalFieldIsVisible = async ({
  fieldId,
  envelopeItemId,
}: {
  fieldId: number;
  envelopeItemId: string;
}) => {
  const fields = await prisma.field.findMany({
    where: {
      envelopeItemId,
    },
    include: {
      conditionalChildRule: true,
    },
  });

  const field = fields.find((candidate) => candidate.id === fieldId);

  if (!field) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: `Field ${fieldId} not found`,
    });
  }

  const visibility = getConditionalFieldVisibility(fields);

  if (!visibility.get(fieldId)) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: `Field ${fieldId} is not currently visible`,
    });
  }
};
