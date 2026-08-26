import type { TLocalField } from '@documenso/lib/client-only/hooks/use-editor-fields';
import { FIELD_GROUP_TYPE, type TFieldGroup } from '@documenso/lib/types/field-group';
import { Button } from '@documenso/ui/primitives/button';
import {
  checkboxValidationLength,
  checkboxValidationRules,
} from '@documenso/ui/primitives/document-flow/field-items-advanced-settings/constants';
import { Input } from '@documenso/ui/primitives/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@documenso/ui/primitives/select';
import { Separator } from '@documenso/ui/primitives/separator';
import { useLingui } from '@lingui/react';
import { FieldType } from '@prisma/client';
import { useMemo, useState } from 'react';

type EditorFieldGroupSettingsProps = {
  field: TLocalField;
  fields: TLocalField[];
  onCreateGroup: (name: string) => void;
  onAssignGroup: (group: TFieldGroup) => void;
  onUpdateValidation: (validationRule: string | null, validationLength: number | null) => void;
  onUngroup: () => void;
};

export const EditorFieldGroupSettings = ({
  field,
  fields,
  onCreateGroup,
  onAssignGroup,
  onUpdateValidation,
  onUngroup,
}: EditorFieldGroupSettingsProps) => {
  const { _ } = useLingui();
  const [groupName, setGroupName] = useState('');

  const compatibleGroups = useMemo(() => {
    const groups = new Map<string, TFieldGroup>();
    const groupType =
      field.type === FieldType.INITIALS ? FIELD_GROUP_TYPE.VALIDATION_GROUP : FIELD_GROUP_TYPE.OPTION_GROUP;

    for (const candidate of fields) {
      if (
        candidate.fieldGroup &&
        candidate.fieldGroup.groupType === groupType &&
        candidate.type === field.type &&
        candidate.recipientId === field.recipientId &&
        candidate.envelopeItemId === field.envelopeItemId
      ) {
        groups.set(candidate.fieldGroup.id, candidate.fieldGroup);
      }
    }

    return [...groups.values()];
  }, [field.envelopeItemId, field.recipientId, field.type, fields]);

  const groupMemberCount = field.fieldGroupId
    ? fields.filter((candidate) => candidate.fieldGroupId === field.fieldGroupId).length
    : 0;

  const fieldMeta = field.fieldMeta;
  const fieldValues = fieldMeta && 'values' in fieldMeta ? fieldMeta.values : undefined;
  const canCreateGroup = Boolean(fieldValues) || field.type === FieldType.INITIALS;
  const hasMultipleOptions = Array.isArray(fieldValues) && fieldValues.length > 1;
  const isValidationGroup = field.fieldGroup?.groupType === FIELD_GROUP_TYPE.VALIDATION_GROUP;
  const hasInvalidValidationRule =
    isValidationGroup &&
    (!field.fieldGroup?.validationRule ||
      !field.fieldGroup.validationLength ||
      field.fieldGroup.validationLength > groupMemberCount);
  const validationLengthOptions = [
    ...new Set([
      ...checkboxValidationLength.filter((length) => length <= groupMemberCount),
      ...(field.fieldGroup?.validationLength ? [field.fieldGroup.validationLength] : []),
    ]),
  ];

  if (field.type !== FieldType.RADIO && field.type !== FieldType.CHECKBOX && field.type !== FieldType.INITIALS) {
    return null;
  }

  return (
    <section className="mt-4 space-y-3">
      <Separator />

      <div>
        <h4 className="font-medium text-sm">{_('Group')}</h4>
        <p className="mt-1 text-muted-foreground text-xs">
          {field.type === FieldType.INITIALS
            ? _('Require a specific number of initials fields in this group.')
            : _('Keep radio or checkbox options connected while placing them on different pages.')}
        </p>
      </div>

      {field.fieldGroup ? (
        <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
          <p className="font-medium text-sm">{field.fieldGroup.name}</p>
          <p className="mt-1 text-muted-foreground text-xs">
            {groupMemberCount} {groupMemberCount === 1 ? _('field') : _('fields')}
          </p>
          {isValidationGroup && (
            <div className="mt-3 space-y-2">
              {hasInvalidValidationRule && (
                <p className="text-destructive text-xs">
                  {_('Choose a rule and a number that does not exceed the number of fields in this group.')}
                </p>
              )}
              <Select
                value={field.fieldGroup.validationRule ?? 'none'}
                onValueChange={(value) => {
                  onUpdateValidation(value === 'none' ? null : value, field.fieldGroup?.validationLength ?? null);
                }}
              >
                <SelectTrigger className="w-full bg-background">
                  <SelectValue placeholder={_('Select a rule')} />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="none">{_('Select a rule')}</SelectItem>
                  {checkboxValidationRules.map((rule) => (
                    <SelectItem key={rule} value={rule}>
                      {rule}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={field.fieldGroup.validationLength?.toString() ?? 'none'}
                onValueChange={(value) => {
                  onUpdateValidation(field.fieldGroup?.validationRule ?? null, value === 'none' ? null : Number(value));
                }}
              >
                <SelectTrigger className="w-full bg-background">
                  <SelectValue placeholder={_('Select a number')} />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="none">{_('Select a number')}</SelectItem>
                  {validationLengthOptions.map((length) => (
                    <SelectItem key={length} value={length.toString()}>
                      {length}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button className="mt-3 w-full" type="button" variant="outline" onClick={onUngroup}>
            {_('Remove from group')}
          </Button>
        </div>
      ) : (
        <>
          {compatibleGroups.length > 0 && (
            <Select
              value="none"
              onValueChange={(value) => {
                const selectedGroup = compatibleGroups.find((group) => group.id === value);

                if (selectedGroup) {
                  onAssignGroup(selectedGroup);
                }
              }}
            >
              <SelectTrigger className="w-full bg-background text-muted-foreground">
                <SelectValue placeholder={_('Add to existing group')} />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="none">{_('Add to existing group')}</SelectItem>
                {compatibleGroups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {hasMultipleOptions && (
            <p className="text-muted-foreground text-xs">
              {_('Selecting a group will split these options into separate fields.')}
            </p>
          )}

          <div className="flex gap-2">
            <Input
              value={groupName}
              placeholder={_('New group name')}
              onChange={(event) => setGroupName(event.target.value)}
            />
            <Button
              type="button"
              disabled={!canCreateGroup}
              onClick={() => {
                onCreateGroup(
                  groupName.trim() ||
                    (field.type === FieldType.RADIO
                      ? _('Radio group')
                      : field.type === FieldType.CHECKBOX
                        ? _('Checkbox group')
                        : _('Initials validation group')),
                );
                setGroupName('');
              }}
            >
              {_('Create')}
            </Button>
          </div>
        </>
      )}
    </section>
  );
};
