import { checkboxValidationSigns } from '@documenso/ui/primitives/document-flow/field-items-advanced-settings/constants';
import type { Field, Recipient } from '@prisma/client';
import { FieldType } from '@prisma/client';

import { validateCheckboxLength } from '../../advanced-fields-validation/validate-checkbox';
import { DIRECT_TEMPLATE_RECIPIENT_EMAIL } from '../../constants/direct-templates';
import { AppError, AppErrorCode } from '../../errors/app-error';
import {
  ZCheckboxFieldMeta,
  ZDropdownFieldMeta,
  ZFieldAndMetaSchema,
  ZNumberFieldMeta,
  ZRadioFieldMeta,
  ZTextFieldMeta,
} from '../../types/field-meta';
import { toCheckboxCustomText, toRadioCustomText } from '../../utils/fields';
import { isRecipientEmailValidForSending } from '../../utils/recipients';

/**
 * Extracts the default value that can be inserted without user interaction.
 *
 * If the field is not auto insertable, returns `null`.
 */
export const extractFieldAutoInsertValues = (
  unknownField: Field,
  recipient: Pick<Recipient, 'email'>,
): { fieldId: number; customText: string } | null => {
  const parsedField = ZFieldAndMetaSchema.safeParse(unknownField);

  if (parsedField.error) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: `One or more fields have invalid metadata. Error: ${parsedField.error.message}`,
    });
  }

  const field = parsedField.data;
  const fieldId = unknownField.id;

  if (
    field.type === FieldType.EMAIL &&
    isRecipientEmailValidForSending(recipient) &&
    recipient.email !== DIRECT_TEMPLATE_RECIPIENT_EMAIL
  ) {
    return {
      fieldId,
      customText: recipient.email,
    };
  }

  if (field.type === FieldType.TEXT) {
    const { text } = ZTextFieldMeta.parse(field.fieldMeta);

    if (text) {
      return {
        fieldId,
        customText: text,
      };
    }
  }

  if (field.type === FieldType.NUMBER) {
    const { value } = ZNumberFieldMeta.parse(field.fieldMeta);

    if (value) {
      return {
        fieldId,
        customText: value,
      };
    }
  }

  if (field.type === FieldType.RADIO) {
    const { values = [] } = ZRadioFieldMeta.parse(field.fieldMeta);
    const checkedItemIndex = values.findIndex((value) => value.checked);

    if (checkedItemIndex !== -1) {
      return {
        fieldId,
        customText: toRadioCustomText(checkedItemIndex),
      };
    }
  }

  if (field.type === FieldType.DROPDOWN) {
    const { defaultValue, values = [] } = ZDropdownFieldMeta.parse(field.fieldMeta);

    if (defaultValue && values.some((value) => value.value === defaultValue)) {
      return {
        fieldId,
        customText: defaultValue,
      };
    }
  }

  if (field.type === FieldType.CHECKBOX) {
    const { values = [], validationRule, validationLength } = ZCheckboxFieldMeta.parse(field.fieldMeta);
    const checkedIndices = values.flatMap((value, index) => (value.checked ? [index] : []));

    let isValid = true;

    if (validationRule && validationLength) {
      const validation = checkboxValidationSigns.find((sign) => sign.label === validationRule);

      if (!validation) {
        throw new AppError(AppErrorCode.INVALID_REQUEST, {
          message: 'Invalid checkbox validation rule',
        });
      }

      isValid = validateCheckboxLength(checkedIndices.length, validation.value, validationLength);
    }

    if (isValid && checkedIndices.length > 0) {
      return {
        fieldId,
        customText: toCheckboxCustomText(checkedIndices),
      };
    }
  }

  return null;
};
