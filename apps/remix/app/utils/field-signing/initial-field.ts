import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import type { TFieldInitials } from '@documenso/lib/types/field';
import type { TSignEnvelopeFieldValue } from '@documenso/trpc/server/envelope-router/sign-envelope-field.types';
import { FieldType } from '@prisma/client';

type HandleInitialsFieldClickOptions = {
  field: TFieldInitials;
  requestInitials: () => Promise<string | null>;
};

export const handleInitialsFieldClick = async (
  options: HandleInitialsFieldClickOptions,
): Promise<Extract<TSignEnvelopeFieldValue, { type: typeof FieldType.INITIALS }> | null> => {
  const { field, requestInitials } = options;

  if (field.type !== FieldType.INITIALS) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Invalid field type',
    });
  }

  if (field.inserted) {
    return {
      type: FieldType.INITIALS,
      value: null,
    };
  }

  const initialsToInsert = await requestInitials();

  if (!initialsToInsert) {
    return null;
  }

  return {
    type: FieldType.INITIALS,
    value: initialsToInsert,
  };
};
