import { getPdfPagesCount } from '@documenso/lib/constants/pdf-viewer';
import { type TConditionalFieldRule, ZConditionalFieldRuleSchema } from '@documenso/lib/types/conditional-field';
import type { TEditorEnvelope } from '@documenso/lib/types/envelope-editor';
import { FIELD_GROUP_TYPE, type TFieldGroup, ZFieldGroupSchema } from '@documenso/lib/types/field-group';
import { ZFieldMetaSchema } from '@documenso/lib/types/field-meta';
import { fromCheckboxValue } from '@documenso/lib/universal/field-checkbox';
import { nanoid } from '@documenso/lib/universal/id';
import { removeConditionalRulesForDeletedFields } from '@documenso/lib/utils/conditional-field-rules';
import { clearOtherRadioGroupSelections } from '@documenso/lib/utils/field-groups';
import { getFieldOptionId, getNextFieldOptionId } from '@documenso/lib/utils/field-option-values';
import { zodResolver } from '@hookform/resolvers/zod';
import type { Field } from '@prisma/client';
import { FieldType } from '@prisma/client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';

export const ZLocalFieldSchema = z.object({
  // This is the actual ID of the field if created.
  id: z.number().optional(),
  // This is the local client side ID of the field.
  formId: z.string().min(1),
  // This is the ID of the envelope item to put the field on.
  envelopeItemId: z.string(),
  type: z.nativeEnum(FieldType),
  recipientId: z.number(),
  page: z.number().min(1),
  positionX: z.number().min(0),
  positionY: z.number().min(0),
  width: z.number().min(0),
  height: z.number().min(0),
  inserted: z.boolean().optional(),
  customText: z.string().optional(),
  templateSourceItemId: z.string().nullable().optional(),
  fieldGroupId: z.string().nullable().default(null),
  fieldGroup: ZFieldGroupSchema.nullable().default(null),
  conditionalChildRule: ZConditionalFieldRuleSchema.nullable().optional(),
  conditionalParentRules: ZConditionalFieldRuleSchema.array().optional(),
  fieldMeta: ZFieldMetaSchema,
});

export type TLocalField = z.infer<typeof ZLocalFieldSchema>;

const getFieldOptions = (field: TLocalField) => {
  if (!field.fieldMeta || !('values' in field.fieldMeta) || !field.fieldMeta.values) {
    return [];
  }

  return field.fieldMeta.values;
};

const getUnusedFieldOptionId = (
  option: { id?: number; value?: string },
  existingOptions: { id?: number; value?: string }[],
) => {
  const existingOptionIds = new Set(
    existingOptions.map((existingOption, index) => getFieldOptionId(existingOption, index)),
  );
  const optionId = option.id ?? 1;

  return existingOptionIds.has(optionId) ? getNextFieldOptionId(existingOptions) : optionId;
};

const updateSingleFieldOptionId = (field: TLocalField, optionId: number): TLocalField['fieldMeta'] => {
  if (field.type === FieldType.RADIO && field.fieldMeta?.type === 'radio' && field.fieldMeta.values?.length === 1) {
    return {
      ...field.fieldMeta,
      values: [{ ...field.fieldMeta.values[0], id: optionId }],
    };
  }

  if (
    field.type === FieldType.CHECKBOX &&
    field.fieldMeta?.type === 'checkbox' &&
    field.fieldMeta.values?.length === 1
  ) {
    return {
      ...field.fieldMeta,
      values: [{ ...field.fieldMeta.values[0], id: optionId }],
    };
  }

  return field.fieldMeta;
};

const ZEditorFieldsFormSchema = z.object({
  fields: z.array(ZLocalFieldSchema),
});

export type TEditorFieldsFormSchema = z.infer<typeof ZEditorFieldsFormSchema>;

type EditorFieldsProps = {
  envelope: TEditorEnvelope;
  handleFieldsUpdate: (fields: TLocalField[]) => unknown;
};

type TEditorField = Omit<Field, 'templateSourceItemId'> & {
  templateSourceItemId?: string | null;
  fieldGroup?: TFieldGroup | null;
  conditionalChildRule?: TConditionalFieldRule | null;
  conditionalParentRules?: TConditionalFieldRule[];
};

type UseEditorFieldsResponse = {
  localFields: TLocalField[];

  // Selected field
  selectedField: TLocalField | undefined;
  setSelectedField: (formId: string | null) => void;

  // Field operations
  addField: (field: Omit<TLocalField, 'formId'>) => TLocalField;
  setFieldId: (formId: string, id: number) => void;
  removeFieldsByFormId: (formIds: string[]) => void;
  updateFieldByFormId: (formId: string, updates: Partial<TLocalField>) => void;
  updateFieldGroupMeta: (field: TLocalField, fieldMeta: TLocalField['fieldMeta']) => void;
  duplicateField: (field: TLocalField, recipientId?: number) => TLocalField;
  duplicateFieldToAllPages: (field: TLocalField, recipientId?: number) => TLocalField[];
  createFieldGroup: (field: TLocalField, name: string) => TLocalField[];
  assignFieldToGroup: (field: TLocalField, group: TFieldGroup) => void;
  updateFieldGroupValidation: (
    field: TLocalField,
    validationRule: string | null,
    validationLength: number | null,
  ) => void;
  ungroupField: (field: TLocalField) => void;

  // Field utilities
  getFieldByFormId: (formId: string) => TLocalField | undefined;
  getFieldsByRecipient: (recipientId: number) => TLocalField[];

  // Selected recipient
  selectedRecipient: TEditorEnvelope['recipients'][number] | null;
  setSelectedRecipient: (recipientId: number | null) => void;

  resetForm: (fields?: TEditorField[]) => void;
};

export const useEditorFields = ({ envelope, handleFieldsUpdate }: EditorFieldsProps): UseEditorFieldsResponse => {
  const [selectedFieldFormId, setSelectedFieldFormId] = useState<string | null>(null);
  const [selectedRecipientId, setSelectedRecipientId] = useState<number | null>(null);

  const generateDefaultValues = (fields?: TEditorField[]) => {
    const formFields = (fields || envelope.fields).map(
      (field): TLocalField => ({
        id: field.id,
        formId: nanoid(),
        envelopeItemId: field.envelopeItemId,
        page: field.page,
        type: field.type,
        positionX: Number(field.positionX),
        positionY: Number(field.positionY),
        width: Number(field.width),
        height: Number(field.height),
        templateSourceItemId: field.templateSourceItemId ?? null,
        fieldGroupId: field.fieldGroupId ?? field.fieldGroup?.id ?? null,
        fieldGroup: field.fieldGroup ?? null,
        conditionalChildRule: field.conditionalChildRule,
        conditionalParentRules: field.conditionalParentRules,
        recipientId: field.recipientId,
        fieldMeta: field.fieldMeta ? ZFieldMetaSchema.parse(field.fieldMeta) : undefined,
      }),
    );

    return {
      fields: formFields,
    };
  };

  const form = useForm<TEditorFieldsFormSchema>({
    defaultValues: generateDefaultValues(),
    resolver: zodResolver(ZEditorFieldsFormSchema),
  });

  const {
    append,
    replace,
    update,
    fields: localFields,
  } = useFieldArray({
    control: form.control,
    name: 'fields',
    keyName: 'react-hook-form-id',
  });

  const triggerFieldsUpdate = () => {
    void handleFieldsUpdate(form.getValues().fields);
  };

  const setSelectedField = (formId: string | null, bypassCheck = false) => {
    if (!formId) {
      setSelectedFieldFormId(null);
      return;
    }

    const foundField = localFields.find((field) => field.formId === formId);
    const recipient = envelope.recipients.find((recipient) => recipient.id === foundField?.recipientId);

    if (recipient) {
      setSelectedRecipient(recipient.id);
    }

    if (bypassCheck) {
      setSelectedFieldFormId(formId);
      return;
    }

    setSelectedFieldFormId(foundField?.formId ?? null);
  };

  const addField = useCallback(
    (fieldData: Omit<TLocalField, 'formId'>): TLocalField => {
      const field: TLocalField = {
        ...fieldData,
        formId: nanoid(12),
        ...restrictFieldPosValues(fieldData),
      };

      append(field);
      triggerFieldsUpdate();
      setSelectedField(field.formId, true);
      return field;
    },
    [append, triggerFieldsUpdate, setSelectedField],
  );

  const removeFieldsByFormId = useCallback(
    (formIds: string[]) => {
      const fields = form.getValues().fields;
      const fieldsToRemove = fields.filter((field) => formIds.includes(field.formId));

      if (fieldsToRemove.length > 0) {
        const deletedFieldIds = new Set(fieldsToRemove.flatMap((field) => (field.id === undefined ? [] : [field.id])));
        const fieldsWithRulesCleaned = removeConditionalRulesForDeletedFields(fields, deletedFieldIds);
        const remainingFields = fieldsWithRulesCleaned.filter((field) => !formIds.includes(field.formId));

        replace(remainingFields);
        void handleFieldsUpdate(remainingFields);
      }
    },
    [form, handleFieldsUpdate, replace],
  );

  const setFieldId = (formId: string, id: number) => {
    const { fields } = form.getValues();

    const index = fields.findIndex((field) => field.formId === formId);

    if (index !== -1) {
      update(index, {
        ...fields[index],
        id,
      });
    }
  };

  const updateFieldByFormId = useCallback(
    (formId: string, updates: Partial<TLocalField>) => {
      const index = localFields.findIndex((field) => field.formId === formId);

      if (index !== -1) {
        const updatedField = {
          ...localFields[index],
          ...updates,
        };

        update(index, {
          ...updatedField,
          ...restrictFieldPosValues(updatedField),
        });
        triggerFieldsUpdate();
      }
    },
    [localFields, update, triggerFieldsUpdate],
  );

  const updateFieldGroupMeta = useCallback(
    (field: TLocalField, fieldMeta: TLocalField['fieldMeta']) => {
      if (!fieldMeta) {
        return;
      }

      if (!field.fieldGroupId || !field.fieldGroup) {
        updateFieldByFormId(field.formId, { fieldMeta });
        return;
      }

      const group = {
        ...field.fieldGroup,
        required: false,
        readOnly: 'readOnly' in fieldMeta ? (fieldMeta.readOnly ?? false) : field.fieldGroup.readOnly,
        fontSize: 'fontSize' in fieldMeta ? (fieldMeta.fontSize ?? null) : field.fieldGroup.fontSize,
        direction: 'direction' in fieldMeta ? (fieldMeta.direction ?? null) : field.fieldGroup.direction,
        validationRule:
          field.fieldGroup.groupType === FIELD_GROUP_TYPE.VALIDATION_GROUP ? field.fieldGroup.validationRule : null,
        validationLength:
          field.fieldGroup.groupType === FIELD_GROUP_TYPE.VALIDATION_GROUP ? field.fieldGroup.validationLength : null,
      };

      const required =
        field.fieldGroup.groupType === FIELD_GROUP_TYPE.VALIDATION_GROUP ? false : (fieldMeta.required ?? false);
      const validationRule = fieldMeta.type === 'checkbox' ? fieldMeta.validationRule || undefined : undefined;
      const validationLength = fieldMeta.type === 'checkbox' ? fieldMeta.validationLength || undefined : undefined;

      const currentFields = form.getValues('fields');
      const fieldsWithRadioSelectionCleared = clearOtherRadioGroupSelections(currentFields, {
        formId: field.formId,
        fieldGroupId: field.fieldGroupId,
        fieldMeta,
      });
      const updatedFields = fieldsWithRadioSelectionCleared.map((candidate) => {
        if (candidate.fieldGroupId !== field.fieldGroupId || !candidate.fieldMeta) {
          return candidate;
        }

        const normalizedFieldMeta =
          candidate.formId === field.formId
            ? fieldMeta
            : {
                ...candidate.fieldMeta,
              };

        return {
          ...candidate,
          fieldGroup: group,
          fieldMeta: {
            ...normalizedFieldMeta,
            required,
            readOnly: false,
            ...(normalizedFieldMeta.type === 'checkbox'
              ? {
                  validationRule,
                  validationLength,
                }
              : {}),
          },
        };
      });

      replace(updatedFields as never);
      triggerFieldsUpdate();
    },
    [form, replace, triggerFieldsUpdate, updateFieldByFormId],
  );

  const duplicateField = useCallback(
    (field: TLocalField): TLocalField => {
      const existingGroupOptions = field.fieldGroupId
        ? localFields.filter((candidate) => candidate.fieldGroupId === field.fieldGroupId).flatMap(getFieldOptions)
        : [];
      const fieldMeta =
        field.fieldGroupId && getFieldOptions(field).length === 1
          ? updateSingleFieldOptionId(field, getUnusedFieldOptionId(getFieldOptions(field)[0], existingGroupOptions))
          : field.fieldMeta;
      const newField: TLocalField = {
        ...structuredClone(field),
        id: undefined,
        formId: nanoid(12),
        recipientId: field.recipientId,
        positionX: field.positionX + 3,
        positionY: field.positionY + 3,
        fieldMeta,
      };

      append(newField);
      triggerFieldsUpdate();
      return newField;
    },
    [append, localFields, triggerFieldsUpdate],
  );

  const duplicateFieldToAllPages = useCallback(
    (field: TLocalField): TLocalField[] => {
      const totalPages = getPdfPagesCount();
      const newFields: TLocalField[] = [];

      if (totalPages < 1) {
        return newFields;
      }

      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
        if (pageNumber === field.page) {
          continue;
        }

        const existingGroupOptions = field.fieldGroupId
          ? localFields.filter((candidate) => candidate.fieldGroupId === field.fieldGroupId).flatMap(getFieldOptions)
          : [];
        const fieldMeta =
          field.fieldGroupId && getFieldOptions(field).length === 1
            ? updateSingleFieldOptionId(
                field,
                getNextFieldOptionId([...existingGroupOptions, ...newFields.flatMap(getFieldOptions)]),
              )
            : field.fieldMeta;
        const newField: TLocalField = {
          ...structuredClone(field),
          id: undefined,
          formId: nanoid(12),
          page: pageNumber,
          fieldMeta,
        };

        append(newField);
        newFields.push(newField);
      }

      triggerFieldsUpdate();
      return newFields;
    },
    [append, localFields, triggerFieldsUpdate],
  );

  const createFieldGroup = useCallback(
    (field: TLocalField, name: string, existingGroup?: TFieldGroup): TLocalField[] => {
      if (field.type === FieldType.INITIALS) {
        const group: TFieldGroup = {
          ...(existingGroup ?? {
            id: nanoid(12),
            name,
            type: FieldType.INITIALS,
            groupType: FIELD_GROUP_TYPE.VALIDATION_GROUP,
            readOnly: false,
            fontSize: null,
            direction: null,
            envelopeId: envelope.id,
            envelopeItemId: field.envelopeItemId,
            recipientId: field.recipientId,
            validationRule: 'Select exactly',
            validationLength: 1,
          }),
          required: false,
        };
        const updatedField: TLocalField = {
          ...field,
          fieldGroupId: group.id,
          fieldGroup: group,
          fieldMeta: field.fieldMeta?.type === 'initials' ? { ...field.fieldMeta, required: false } : field.fieldMeta,
        };

        updateFieldByFormId(field.formId, updatedField);
        return [updatedField];
      }

      if (field.type !== FieldType.RADIO && field.type !== FieldType.CHECKBOX) {
        return [];
      }

      const metaType = field.type === FieldType.RADIO ? 'radio' : 'checkbox';
      const fieldMeta = field.fieldMeta?.type === metaType ? field.fieldMeta : undefined;

      const group: TFieldGroup = {
        ...(existingGroup ?? {
          id: nanoid(12),
          name,
          type: field.type,
          groupType: FIELD_GROUP_TYPE.OPTION_GROUP,
          readOnly: fieldMeta?.readOnly ?? false,
          fontSize: fieldMeta?.fontSize ?? null,
          direction: fieldMeta?.direction ?? 'vertical',
          envelopeId: envelope.id,
          envelopeItemId: field.envelopeItemId,
          recipientId: field.recipientId,
        }),
        required: false,
        validationRule: null,
        validationLength: null,
      };

      const values = field.fieldMeta && 'values' in field.fieldMeta ? field.fieldMeta.values || [] : [];

      const groupValues: Array<{ id: number; checked: boolean; value: string }> =
        values.length > 0
          ? values.map((option, index) => {
              const normalizedOption = option as { id?: number; checked?: boolean; value: string };

              return {
                id: normalizedOption.id ?? index + 1,
                checked: normalizedOption.checked ?? false,
                value: normalizedOption.value,
              };
            })
          : [{ id: 1, checked: false, value: '' }];
      const currentIndex = localFields.findIndex((candidate) => candidate.formId === field.formId);

      if (currentIndex === -1) {
        return [];
      }

      const isHorizontal = fieldMeta?.direction === 'horizontal';
      const optionWidth = isHorizontal ? field.width / groupValues.length : field.width;
      const optionHeight = isHorizontal ? field.height : field.height / groupValues.length;
      const selectedCheckboxes =
        field.type === FieldType.CHECKBOX && field.customText
          ? fromCheckboxValue(field.customText).flatMap((value) => {
              const index = Number(value);
              return Number.isInteger(index) ? [index] : [];
            })
          : [];
      const selectedRadio = field.type === FieldType.RADIO ? Number(field.customText) : -1;

      const createdFields = groupValues.map(
        (option, index): TLocalField => ({
          ...structuredClone(field),
          id: index === 0 ? field.id : undefined,
          formId: index === 0 ? field.formId : nanoid(12),
          fieldGroupId: group.id,
          fieldGroup: group,
          positionX: isHorizontal ? field.positionX + optionWidth * index : field.positionX,
          positionY: isHorizontal ? field.positionY : field.positionY + optionHeight * index,
          width: optionWidth,
          height: optionHeight,
          customText:
            field.type === FieldType.RADIO
              ? selectedRadio === index
                ? '0'
                : ''
              : selectedCheckboxes.includes(index)
                ? JSON.stringify([0])
                : '',
          fieldMeta: fieldMeta
            ? {
                ...fieldMeta,
                required: fieldMeta.required ?? false,
                readOnly: false,
                values: [option],
              }
            : field.fieldMeta,
        }),
      );

      const newFields = [...localFields] as unknown as TLocalField[];
      newFields.splice(currentIndex, 1, ...createdFields);
      replace(newFields as never);
      triggerFieldsUpdate();
      setSelectedField(createdFields[0]?.formId ?? null, true);

      return createdFields;
    },
    [envelope.id, localFields, replace, triggerFieldsUpdate, updateFieldByFormId],
  );

  const assignFieldToGroup = useCallback(
    (field: TLocalField, group: TFieldGroup) => {
      if (
        field.type !== group.type ||
        field.envelopeItemId !== group.envelopeItemId ||
        field.recipientId !== group.recipientId
      ) {
        return;
      }

      const values = field.fieldMeta && 'values' in field.fieldMeta ? field.fieldMeta.values || [] : [];

      if (values.length > 1) {
        createFieldGroup(field, group.name, group);
        return;
      }

      const existingGroupField = localFields.find((candidate) => candidate.fieldGroupId === group.id);
      const existingGroupMeta = existingGroupField?.fieldMeta;
      const existingGroupOptions = localFields
        .filter((candidate) => candidate.fieldGroupId === group.id && candidate.formId !== field.formId)
        .flatMap(getFieldOptions);
      const fieldMetaWithUniqueOptionId =
        field.fieldMeta && values.length === 1
          ? updateSingleFieldOptionId(field, getUnusedFieldOptionId(values[0], existingGroupOptions))
          : field.fieldMeta;
      const isValidationGroup = group.groupType === FIELD_GROUP_TYPE.VALIDATION_GROUP;

      updateFieldByFormId(field.formId, {
        fieldGroupId: group.id,
        fieldGroup: {
          ...group,
          required: false,
          validationRule: isValidationGroup ? group.validationRule : null,
          validationLength: isValidationGroup ? group.validationLength : null,
        },
        fieldMeta: fieldMetaWithUniqueOptionId
          ? {
              ...fieldMetaWithUniqueOptionId,
              required: isValidationGroup
                ? false
                : (existingGroupMeta?.required ?? fieldMetaWithUniqueOptionId.required ?? false),
              readOnly: false,
              ...(fieldMetaWithUniqueOptionId.type === 'checkbox'
                ? {
                    validationRule:
                      existingGroupMeta?.type === 'checkbox'
                        ? existingGroupMeta.validationRule || undefined
                        : fieldMetaWithUniqueOptionId.validationRule || undefined,
                    validationLength:
                      existingGroupMeta?.type === 'checkbox'
                        ? existingGroupMeta.validationLength || undefined
                        : fieldMetaWithUniqueOptionId.validationLength || undefined,
                  }
                : {}),
            }
          : fieldMetaWithUniqueOptionId,
      });
    },
    [createFieldGroup, localFields, updateFieldByFormId],
  );

  const updateFieldGroupValidation = useCallback(
    (field: TLocalField, validationRule: string | null, validationLength: number | null) => {
      if (
        !field.fieldGroupId ||
        !field.fieldGroup ||
        field.fieldGroup.groupType !== FIELD_GROUP_TYPE.VALIDATION_GROUP
      ) {
        return;
      }

      const group = {
        ...field.fieldGroup,
        validationRule,
        validationLength,
      };

      replace(
        localFields.map((candidate) =>
          candidate.fieldGroupId === field.fieldGroupId
            ? {
                ...candidate,
                fieldGroup: group,
                fieldMeta:
                  candidate.fieldMeta?.type === 'initials'
                    ? { ...candidate.fieldMeta, required: false }
                    : candidate.fieldMeta,
              }
            : candidate,
        ) as never,
      );
      triggerFieldsUpdate();
    },
    [localFields, replace, triggerFieldsUpdate],
  );

  const ungroupField = useCallback(
    (field: TLocalField) => {
      if (!field.fieldGroupId) {
        return;
      }

      const groupedFields = localFields.filter((candidate) => candidate.fieldGroupId === field.fieldGroupId);
      const group = field.fieldGroup;

      for (const groupedField of groupedFields) {
        updateFieldByFormId(groupedField.formId, {
          fieldGroupId: null,
          fieldGroup: null,
          fieldMeta: groupedField.fieldMeta
            ? ({
                ...groupedField.fieldMeta,
                readOnly: group?.readOnly ?? false,
                fontSize: group?.fontSize ?? undefined,
                direction: group?.direction === 'horizontal' ? 'horizontal' : 'vertical',
              } as TLocalField['fieldMeta'])
            : groupedField.fieldMeta,
        });
      }
    },
    [localFields, updateFieldByFormId],
  );

  const getFieldByFormId = useCallback(
    (formId: string): TLocalField | undefined => {
      return localFields.find((field) => field.formId === formId) as TLocalField | undefined;
    },
    [localFields],
  );

  const getFieldsByRecipient = useCallback(
    (recipientId: number): TLocalField[] => {
      return localFields.filter((field) => field.recipientId === recipientId);
    },
    [localFields],
  );

  const selectedRecipient = useMemo(() => {
    return envelope.recipients.find((recipient) => recipient.id === selectedRecipientId) || null;
  }, [selectedRecipientId, envelope.recipients]);

  const selectedField = useMemo(() => {
    return localFields.find((field) => field.formId === selectedFieldFormId);
  }, [selectedFieldFormId, localFields]);

  /**
   * Keep the selected field form ID in sync with the local fields.
   */
  useEffect(() => {
    const foundField = localFields.find((field) => field.formId === selectedFieldFormId);
    setSelectedFieldFormId(foundField?.formId ?? null);
  }, [selectedFieldFormId, localFields]);

  const setSelectedRecipient = (recipientId: number | null) => {
    const foundRecipient = envelope.recipients.find((recipient) => recipient.id === recipientId);

    setSelectedRecipientId(foundRecipient?.id ?? null);
  };

  const resetForm = (fields?: TEditorField[]) => {
    form.reset(generateDefaultValues(fields));
  };

  return {
    // Core state
    localFields,

    // Field operations
    addField,
    setFieldId,
    removeFieldsByFormId,
    updateFieldByFormId,
    updateFieldGroupMeta,
    duplicateField,
    duplicateFieldToAllPages,
    createFieldGroup,
    assignFieldToGroup,
    updateFieldGroupValidation,
    ungroupField,

    // Field utilities
    getFieldByFormId,
    getFieldsByRecipient,

    // Selected field
    selectedField,
    setSelectedField,

    // Selected recipient
    selectedRecipient,
    setSelectedRecipient,

    resetForm,
  };
};

const restrictFieldPosValues = (field: Pick<TLocalField, 'positionX' | 'positionY' | 'width' | 'height'>) => {
  return {
    positionX: Math.max(0, Math.min(100, field.positionX)),
    positionY: Math.max(0, Math.min(100, field.positionY)),
    width: Math.max(0, Math.min(100, field.width)),
    height: Math.max(0, Math.min(100, field.height)),
  };
};
