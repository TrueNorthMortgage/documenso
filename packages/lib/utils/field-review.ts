import type { TEnvelope } from '../types/envelope';
import { getConditionalFieldVisibility } from '../universal/conditional-field-visibility';
import { getFieldGroupValidationState, isRequiredField } from './field-groups';

export type ReviewField = TEnvelope['fields'][number];

export type FieldReviewStatus =
  | 'complete'
  | 'required'
  | 'optional'
  | 'read-only'
  | 'hidden'
  | 'group-complete'
  | 'group-incomplete'
  | 'invalid-group';

/** Review group requirements together, rather than treating unselected options as missing fields. */
export const getFieldReview = (fields: ReviewField[]) => {
  const visibility = getConditionalFieldVisibility(fields);
  const visibleFields = fields.filter((field) => visibility.get(field.id) ?? true);

  return fields.map((field) => {
    const groupFields = visibleFields.filter((candidate) => candidate.fieldGroupId === field.fieldGroupId);
    const groupState = field.fieldGroup ? getFieldGroupValidationState(groupFields, field.fieldGroup) : null;

    let status: FieldReviewStatus;

    if (!(visibility.get(field.id) ?? true)) {
      status = 'hidden';
    } else if (field.fieldGroupId && field.fieldGroup && groupState) {
      status = !groupState.isConfigurationValid
        ? 'invalid-group'
        : groupState.isSatisfied
          ? 'group-complete'
          : 'group-incomplete';
    } else if (field.inserted) {
      status = 'complete';
    } else if (isRequiredField(field)) {
      status = 'required';
    } else if (field.fieldMeta?.readOnly) {
      status = 'read-only';
    } else {
      status = 'optional';
    }

    return {
      field,
      status,
      groupState,
      isBlocking: ['required', 'group-incomplete', 'invalid-group'].includes(status),
      requirementKey: field.fieldGroupId ?? `field-${field.id}`,
    };
  });
};
