import { DateTime } from 'luxon';
import { DEFAULT_DOCUMENT_DATE_FORMAT, isDateFormatWithTime } from '../constants/date-formats';
import { DEFAULT_DOCUMENT_TIME_ZONE } from '../constants/time-zones';
import { AppError, AppErrorCode } from '../errors/app-error';
import { ZDateFieldMeta } from '../types/field-meta';

export const isDateFieldAutoFillEnabled = (fieldMeta: unknown): boolean => {
  const parsedFieldMeta = ZDateFieldMeta.safeParse(fieldMeta);

  return !parsedFieldMeta.success || parsedFieldMeta.data.autoFill;
};

export const getDateFieldInputValue = ({
  value,
  dateFormat,
  timezone,
}: {
  value: string;
  dateFormat?: string | null;
  timezone?: string | null;
}): string | undefined => {
  const resolvedDateFormat = dateFormat ?? DEFAULT_DOCUMENT_DATE_FORMAT;
  const parsedDate = DateTime.fromFormat(value, resolvedDateFormat, {
    zone: timezone ?? DEFAULT_DOCUMENT_TIME_ZONE,
  });

  if (!parsedDate.isValid) {
    return undefined;
  }

  if (!isDateFormatWithTime(resolvedDateFormat)) {
    return parsedDate.toFormat('yyyy-MM-dd');
  }

  if (resolvedDateFormat.includes('S')) {
    return parsedDate.toFormat("yyyy-MM-dd'T'HH:mm:ss.SSS");
  }

  if (resolvedDateFormat.includes('s')) {
    return parsedDate.toFormat("yyyy-MM-dd'T'HH:mm:ss");
  }

  return parsedDate.toFormat("yyyy-MM-dd'T'HH:mm");
};

export const formatDateFieldValue = ({
  value,
  dateFormat,
  timezone,
}: {
  value: string;
  dateFormat?: string | null;
  timezone?: string | null;
}): string => {
  const hasTime = isDateFormatWithTime(dateFormat);
  const parsedDate = DateTime.fromISO(value, {
    zone: timezone ?? DEFAULT_DOCUMENT_TIME_ZONE,
  });

  // Native date and datetime-local inputs submit normalized ISO values regardless of the
  // document display format.
  const isValidInput = hasTime
    ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/.test(value)
    : /^\d{4}-\d{2}-\d{2}$/.test(value);

  if (!parsedDate.isValid || !isValidInput) {
    throw new AppError(AppErrorCode.INVALID_BODY, {
      message: 'Invalid date',
    });
  }

  return parsedDate.toFormat(dateFormat ?? DEFAULT_DOCUMENT_DATE_FORMAT);
};
