import { validateCheckboxLength } from '@documenso/lib/advanced-fields-validation/validate-checkbox';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import type { TFieldCheckbox } from '@documenso/lib/types/field';
import type { TCheckboxFieldMeta } from '@documenso/lib/types/field-meta';
import { getCheckboxGroupFieldValues, getCheckboxGroupOptions } from '@documenso/lib/utils/field-groups';
import type { TSignEnvelopeFieldValue } from '@documenso/trpc/server/envelope-router/sign-envelope-field.types';
import { checkboxValidationSigns } from '@documenso/ui/primitives/document-flow/field-items-advanced-settings/constants';
import { FieldType } from '@prisma/client';

import { SignFieldCheckboxDialog } from '~/components/dialogs/sign-field-checkbox-dialog';

type HandleCheckboxFieldClickOptions = {
  field: TFieldCheckbox;
  clickedCheckboxIndex: number;
  groupFields?: TFieldCheckbox[];
};

export type TCheckboxFieldSigningPayload = {
  fieldId: number;
  fieldValue: Extract<TSignEnvelopeFieldValue, { type: typeof FieldType.CHECKBOX }>;
};

export const handleCheckboxFieldClick = async (
  options: HandleCheckboxFieldClickOptions,
): Promise<TCheckboxFieldSigningPayload[] | null> => {
  const { field, clickedCheckboxIndex, groupFields = [] } = options;

  if (field.type !== FieldType.CHECKBOX) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Invalid field type',
    });
  }

  const isGrouped = field.fieldGroupId !== null && groupFields.length > 1;
  const fields = isGrouped ? groupFields : [field];
  const groupOptions = getCheckboxGroupOptions(fields);
  const clickedOptionIndex = isGrouped
    ? groupOptions.findIndex((option) => option.fieldId === field.id && option.fieldValueIndex === clickedCheckboxIndex)
    : clickedCheckboxIndex;

  if (clickedOptionIndex < 0) {
    return null;
  }

  const checkedValues = groupOptions.flatMap((option, index) => (option.selected ? [index] : []));
  const selectedValues = checkedValues.includes(clickedOptionIndex)
    ? checkedValues.filter((index) => index !== clickedOptionIndex)
    : [...checkedValues, clickedOptionIndex];

  const createPayloads = (selectedOptionIndices: number[]): TCheckboxFieldSigningPayload[] => {
    if (!isGrouped) {
      return [
        {
          fieldId: field.id,
          fieldValue: {
            type: FieldType.CHECKBOX,
            value: selectedOptionIndices,
          },
        },
      ];
    }

    return getCheckboxGroupFieldValues(fields, selectedOptionIndices).map(({ fieldId, value }) => ({
      fieldId,
      fieldValue: {
        type: FieldType.CHECKBOX,
        value,
      },
    }));
  };

  if (selectedValues.length === 0) {
    return createPayloads([]);
  }

  const validationRule = field.fieldGroup?.validationRule ?? field.fieldMeta.validationRule;
  const validationLength = field.fieldGroup?.validationLength ?? field.fieldMeta.validationLength;

  if (validationRule && validationLength) {
    const checkboxValidationRule = checkboxValidationSigns.find((sign) => sign.label === validationRule);

    if (!checkboxValidationRule) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: 'Invalid checkbox validation rule',
      });
    }

    // Custom logic to make it flow better.
    // If "at most" OR "exactly" 1 value then just return the new selected value if exists.
    if ((checkboxValidationRule.value === '=' || checkboxValidationRule.value === '<=') && validationLength === 1) {
      return createPayloads([clickedOptionIndex]);
    }

    const isValid = validateCheckboxLength(selectedValues.length, checkboxValidationRule.value, validationLength);

    // Only render validation dialog if validation is invalid.
    if (!isValid) {
      const dialogFieldMeta: TCheckboxFieldMeta = {
        ...field.fieldMeta,
        label: field.fieldGroup?.name ?? field.fieldMeta.label,
        values: groupOptions.map((option, index) => ({
          id: index,
          checked: selectedValues.includes(index),
          value: option.value,
        })),
      };

      const dialogSelection = await SignFieldCheckboxDialog.call({
        fieldMeta: dialogFieldMeta,
        validationRule: checkboxValidationRule.value,
        validationLength,
        preselectedIndices: selectedValues,
      });

      if (!dialogSelection) {
        return null;
      }

      return createPayloads(dialogSelection);
    }
  }

  return createPayloads(selectedValues);
};
