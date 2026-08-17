import { prisma } from '@documenso/prisma';
import { DocumentStatus, EnvelopeType, FieldType } from '@prisma/client';

import { AppError, AppErrorCode } from '../../errors/app-error';
import {
  ConditionalFieldRuleOperator,
  type ConditionalFieldRuleOperator as TConditionalFieldRuleOperator,
} from '../../types/conditional-field';
import { buildTeamWhereQuery } from '../../utils/teams';

const CONDITIONAL_PARENT_TYPES = new Set<FieldType>([
  FieldType.CHECKBOX,
  FieldType.RADIO,
  FieldType.DROPDOWN,
  FieldType.TEXT,
]);

export type CreateConditionalFieldRuleOptions = {
  userId: number;
  teamId: number;
  childFieldId: number;
  parentFieldId: number;
  operator: TConditionalFieldRuleOperator;
  value?: string | null;
};

const getAuthorizedField = async ({ fieldId, userId, teamId }: { fieldId: number; userId: number; teamId: number }) => {
  const field = await prisma.field.findFirst({
    where: {
      id: fieldId,
      envelope: {
        team: buildTeamWhereQuery({ teamId, userId }),
      },
    },
    include: {
      envelope: true,
      conditionalChildRule: true,
      conditionalParentRules: true,
    },
  });

  if (!field) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: `Field with id ${fieldId} not found`,
    });
  }

  return field;
};

const validateRule = ({
  childField,
  parentField,
  operator,
  value,
}: {
  childField: Awaited<ReturnType<typeof getAuthorizedField>>;
  parentField: Awaited<ReturnType<typeof getAuthorizedField>>;
  operator: TConditionalFieldRuleOperator;
  value?: string | null;
}) => {
  if (childField.id === parentField.id) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'A field cannot be conditional on itself',
    });
  }

  if (childField.envelopeId !== parentField.envelopeId || childField.envelopeItemId !== parentField.envelopeItemId) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Conditional fields must belong to the same document',
    });
  }

  if (childField.recipientId !== parentField.recipientId) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Conditional fields must belong to the same recipient',
    });
  }

  if (childField.envelope.type !== EnvelopeType.DOCUMENT && childField.envelope.type !== EnvelopeType.TEMPLATE) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Conditional fields are not supported for this envelope',
    });
  }

  if (childField.envelope.completedAt || childField.envelope.status !== DocumentStatus.DRAFT) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Conditional fields can only be changed on draft envelopes',
    });
  }

  if (parentField.conditionalChildRule) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Nested conditional fields are not supported',
    });
  }

  if (childField.conditionalParentRules.length > 0) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'A field that controls other fields cannot be conditional',
    });
  }

  if (!CONDITIONAL_PARENT_TYPES.has(parentField.type)) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'This field type cannot be used as a conditional parent',
    });
  }

  if (operator === ConditionalFieldRuleOperator.ANY_TEXT) {
    if (parentField.type !== FieldType.TEXT) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: 'Any text conditions require a text parent field',
      });
    }

    return;
  }

  if (!value?.trim()) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'A conditional value is required',
    });
  }

  if (parentField.type === FieldType.TEXT) {
    return;
  }

  const parentMeta = parentField.fieldMeta as { values?: Array<{ value: string }> } | null;
  const allowedValues = parentMeta?.values?.map((option) => option.value) ?? [];

  if (!allowedValues.includes(value)) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'The conditional value is not available on the parent field',
    });
  }
};

export const createConditionalFieldRule = async ({
  userId,
  teamId,
  childFieldId,
  parentFieldId,
  operator,
  value,
}: CreateConditionalFieldRuleOptions) => {
  const [childField, parentField] = await Promise.all([
    getAuthorizedField({ fieldId: childFieldId, userId, teamId }),
    getAuthorizedField({ fieldId: parentFieldId, userId, teamId }),
  ]);

  if (childField.conditionalChildRule) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'This child field already has a conditional rule',
    });
  }

  validateRule({ childField, parentField, operator, value });

  return await prisma.conditionalFieldRule.create({
    data: {
      childFieldId,
      parentFieldId,
      operator,
      value: operator === ConditionalFieldRuleOperator.ANY_TEXT ? null : (value?.trim() ?? null),
    },
  });
};

export type DeleteConditionalFieldRuleOptions = {
  userId: number;
  teamId: number;
  childFieldId: number;
};

export const deleteConditionalFieldRule = async ({
  userId,
  teamId,
  childFieldId,
}: DeleteConditionalFieldRuleOptions) => {
  const childField = await getAuthorizedField({ fieldId: childFieldId, userId, teamId });

  if (childField.envelope.type !== EnvelopeType.DOCUMENT && childField.envelope.type !== EnvelopeType.TEMPLATE) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Conditional fields are not supported for this envelope',
    });
  }

  if (childField.envelope.completedAt || childField.envelope.status !== DocumentStatus.DRAFT) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'Conditional fields can only be changed on draft envelopes',
    });
  }

  await prisma.conditionalFieldRule.deleteMany({
    where: {
      childFieldId,
    },
  });
};
