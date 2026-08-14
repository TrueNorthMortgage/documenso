import {
  ConditionalFieldRuleOperator,
  type TConditionalFieldRule,
  type ConditionalFieldRuleOperator as TConditionalFieldRuleOperator,
} from '@documenso/lib/types/conditional-field';
import { FieldType } from '@prisma/client';
import { useMemo, useState } from 'react';
import { cn } from '../../lib/utils';
import { Button } from '../button';
import { Checkbox } from '../checkbox';
import { Input } from '../input';
import { Label } from '../label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../select';
import type { FieldFormType } from './add-fields';

export type ConditionalFieldRuleInput = {
  childFieldId: number;
  parentFieldId: number;
  operator: TConditionalFieldRuleOperator;
  value: string | null;
};

export type ConditionalFieldSettingsProps = {
  field: FieldFormType;
  fields: FieldFormType[];
  className?: string;
  onCreateRule?: (input: ConditionalFieldRuleInput) => Promise<TConditionalFieldRule>;
  onDeleteRule?: (childFieldId: number) => Promise<void>;
  onRuleCreated?: (rule: TConditionalFieldRule) => void;
  onRuleDeleted?: (childFieldId: number) => void;
};

const FIELD_TYPE_LABELS: Partial<Record<FieldType, string>> = {
  [FieldType.CHECKBOX]: 'Checkbox',
  [FieldType.DATE]: 'Date',
  [FieldType.DROPDOWN]: 'Dropdown',
  [FieldType.EMAIL]: 'Email',
  [FieldType.INITIALS]: 'Initials',
  [FieldType.NAME]: 'Name',
  [FieldType.NUMBER]: 'Number',
  [FieldType.RADIO]: 'Radio',
  [FieldType.SIGNATURE]: 'Signature',
  [FieldType.TEXT]: 'Text',
};

export const getFieldDisplayName = (field: FieldFormType, fields: FieldFormType[]) => {
  const label = field.fieldMeta && 'label' in field.fieldMeta ? field.fieldMeta.label?.trim() : undefined;
  const typeLabel = FIELD_TYPE_LABELS[field.type] ?? field.type;
  const sameTypeFields = fields.filter((candidate) => candidate.type === field.type);
  const fieldIndex = sameTypeFields.findIndex(
    (candidate) =>
      candidate.formId === field.formId || (candidate.nativeId !== undefined && candidate.nativeId === field.nativeId),
  );
  const ordinal = fieldIndex >= 0 ? ` ${fieldIndex + 1}` : '';
  return label || `${typeLabel}${ordinal}`;
};

const getParentValues = (field: FieldFormType) => {
  if (!field.fieldMeta || !('values' in field.fieldMeta)) {
    return [];
  }

  return field.fieldMeta.values?.map((option) => ('value' in option ? option.value : '')).filter(Boolean) ?? [];
};

export const ConditionalFieldSettings = ({
  field,
  fields,
  className,
  onCreateRule,
  onDeleteRule,
  onRuleCreated,
  onRuleDeleted,
}: ConditionalFieldSettingsProps) => {
  const [isAddingRule, setIsAddingRule] = useState(false);
  const [operator, setOperator] = useState<TConditionalFieldRuleOperator>(ConditionalFieldRuleOperator.EQUALS);
  const [value, setValue] = useState('');
  const [selectedChildIds, setSelectedChildIds] = useState<number[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isParentType = new Set<FieldType>([
    FieldType.CHECKBOX,
    FieldType.RADIO,
    FieldType.DROPDOWN,
    FieldType.TEXT,
  ]).has(field.type);
  const parentRules = field.conditionalParentRules ?? [];
  const parentValues = useMemo(() => getParentValues(field), [field]);
  const eligibleChildren = useMemo(
    () =>
      fields.filter(
        (candidate) =>
          candidate.nativeId &&
          candidate.nativeId !== field.nativeId &&
          candidate.recipientId === field.recipientId &&
          candidate.envelopeItemId === field.envelopeItemId &&
          !candidate.conditionalChildRule &&
          !(candidate.conditionalParentRules && candidate.conditionalParentRules.length > 0),
      ),
    [field, fields],
  );

  const childRule = field.conditionalChildRule;
  const childParent = childRule
    ? fields.find((candidate) => candidate.nativeId === childRule.parentFieldId)
    : undefined;

  const resetForm = () => {
    setIsAddingRule(false);
    setOperator(ConditionalFieldRuleOperator.EQUALS);
    setValue('');
    setSelectedChildIds([]);
    setError(null);
  };

  const toggleChild = (childFieldId: number, checked: boolean) => {
    setSelectedChildIds((current) =>
      checked ? [...current, childFieldId] : current.filter((candidate) => candidate !== childFieldId),
    );
  };

  const handleCreate = async () => {
    if (!field.nativeId || !onCreateRule || selectedChildIds.length === 0) {
      return;
    }

    if (operator === ConditionalFieldRuleOperator.EQUALS && !value.trim()) {
      setError('Choose or enter a value for this condition.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      for (const childFieldId of selectedChildIds) {
        const rule = await onCreateRule({
          childFieldId,
          parentFieldId: field.nativeId,
          operator,
          value: operator === ConditionalFieldRuleOperator.ANY_TEXT ? null : value,
        });

        onRuleCreated?.(rule);
      }

      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create the conditional rule.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (childFieldId: number) => {
    if (!onDeleteRule) {
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onDeleteRule(childFieldId);
      onRuleDeleted?.(childFieldId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove the conditional rule.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isParentType && !childRule) {
    return null;
  }

  return (
    <div
      className={cn('mt-6 border-border border-t px-4 pt-4 pb-4', className)}
      data-testid="conditional-field-settings"
    >
      <div className="mb-4">
        <div className="font-semibold text-foreground text-sm">Conditional Logic</div>
      </div>

      {childRule && childParent && (
        <div className="mb-4 rounded-md border border-border bg-muted/30 p-3 text-sm">
          <div className="font-medium">Conditional visibility</div>
          <div className="mt-1 text-muted-foreground">
            Shown when “{getFieldDisplayName(childParent, fields)}” is{' '}
            {childRule.operator === ConditionalFieldRuleOperator.ANY_TEXT ? 'any text' : `“${childRule.value}”`}.
          </div>
          <Button
            className="mt-3"
            variant="outline"
            size="sm"
            disabled={isSaving}
            onClick={() => void handleDelete(childRule.childFieldId)}
          >
            Remove condition
          </Button>
        </div>
      )}

      {isParentType && !field.nativeId && (
        <p className="text-muted-foreground text-sm">Save this field before adding conditional logic.</p>
      )}

      {isParentType && field.nativeId && (
        <>
          {parentRules.length > 0 && (
            <div className="mb-3 space-y-2">
              {parentRules.map((rule) => (
                <div
                  className="flex items-center justify-between rounded-md border border-border p-2 text-sm"
                  key={rule.id}
                >
                  <span>
                    {rule.operator === ConditionalFieldRuleOperator.ANY_TEXT ? 'Any text' : rule.value} →{' '}
                    {fields.filter((candidate) => candidate.conditionalChildRule?.id === rule.id).length} fields
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isSaving}
                    onClick={() => {
                      const children = fields.filter((candidate) => candidate.conditionalChildRule?.id === rule.id);
                      void Promise.all(
                        children.flatMap((candidate) => (candidate.nativeId ? [handleDelete(candidate.nativeId)] : [])),
                      );
                    }}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}

          {!isAddingRule ? (
            <Button className="mt-4 w-full" variant="outline" size="sm" onClick={() => setIsAddingRule(true)}>
              Add condition
            </Button>
          ) : (
            <div className="space-y-3 rounded-md border border-border p-3">
              <div>
                <Label>When value is</Label>
                {field.type === FieldType.TEXT ? (
                  <Select value={operator} onValueChange={(next) => setOperator(next as TConditionalFieldRuleOperator)}>
                    <SelectTrigger className="mt-2 bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      <SelectItem value={ConditionalFieldRuleOperator.EQUALS}>Exact text</SelectItem>
                      <SelectItem value={ConditionalFieldRuleOperator.ANY_TEXT}>Any text</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Select value={value} onValueChange={setValue}>
                    <SelectTrigger className="mt-2 bg-background">
                      <SelectValue placeholder="Select an option" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {parentValues.map((parentValue) => (
                        <SelectItem key={parentValue} value={parentValue}>
                          {parentValue}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {field.type === FieldType.TEXT && operator === ConditionalFieldRuleOperator.EQUALS && (
                  <Input
                    className="mt-2 bg-background"
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    placeholder="Enter exact text"
                  />
                )}
              </div>

              <div>
                <Label>Then show these fields</Label>
                <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                  {eligibleChildren.length === 0 && (
                    <p className="text-muted-foreground text-sm">No eligible fields available.</p>
                  )}
                  {eligibleChildren.map((candidate) => {
                    const childId = candidate.nativeId;

                    if (!childId) {
                      return null;
                    }

                    return (
                      <label className="flex items-center gap-2 text-sm" key={childId}>
                        <Checkbox
                          checked={selectedChildIds.includes(childId)}
                          onCheckedChange={(checked: boolean | 'indeterminate') =>
                            toggleChild(childId, checked === true)
                          }
                        />
                        <span>{getFieldDisplayName(candidate, fields)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {error && <p className="text-destructive text-sm">{error}</p>}

              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" disabled={isSaving} onClick={resetForm}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={isSaving || selectedChildIds.length === 0}
                  onClick={() => void handleCreate()}
                >
                  Save condition
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
