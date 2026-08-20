import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import type { TFieldDate } from '@documenso/lib/types/field';
import { getDateFieldInputValue } from '@documenso/lib/utils/date-fields';
import type { TSignEnvelopeFieldValue } from '@documenso/trpc/server/envelope-router/sign-envelope-field.types';
import { FieldType } from '@prisma/client';

import { SignFieldDateDialog } from '~/components/dialogs/sign-field-date-dialog';

type HandleDateFieldClickOptions = {
  field: TFieldDate;
  dateFormat?: string | null;
  timezone?: string | null;
};

export const handleDateFieldClick = async (
  options: HandleDateFieldClickOptions,
): Promise<Extract<TSignEnvelopeFieldValue, { type: typeof FieldType.DATE }> | null> => {
  const { field, dateFormat, timezone } = options;

  if (field.type !== FieldType.DATE) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Invalid field type',
    });
  }

  const date = await SignFieldDateDialog.call({
    fieldMeta: field.fieldMeta,
    dateFormat,
    initialDate: field.inserted
      ? getDateFieldInputValue({
          value: field.customText,
          dateFormat,
          timezone,
        })
      : undefined,
  });

  if (!date) {
    return null;
  }

  return {
    type: FieldType.DATE,
    value: date,
  };
};
