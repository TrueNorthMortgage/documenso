import type { TLocalField } from '@documenso/lib/client-only/hooks/use-editor-fields';
import type { TFieldGroup } from '@documenso/lib/types/field-group';
import { Button } from '@documenso/ui/primitives/button';
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
  onUngroup: () => void;
};

export const EditorFieldGroupSettings = ({
  field,
  fields,
  onCreateGroup,
  onAssignGroup,
  onUngroup,
}: EditorFieldGroupSettingsProps) => {
  const { _ } = useLingui();
  const [groupName, setGroupName] = useState('');

  const compatibleGroups = useMemo(() => {
    const groups = new Map<string, TFieldGroup>();

    for (const candidate of fields) {
      if (
        candidate.fieldGroup &&
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
  const canCreateGroup = Boolean(fieldValues);
  const hasMultipleOptions = Array.isArray(fieldValues) && fieldValues.length > 1;

  if (field.type !== FieldType.RADIO && field.type !== FieldType.CHECKBOX) {
    return null;
  }

  return (
    <section className="mt-4 space-y-3">
      <Separator />

      <div>
        <h4 className="font-medium text-sm">{_('Group')}</h4>
        <p className="mt-1 text-muted-foreground text-xs">
          {_('Keep radio or checkbox options connected while placing them on different pages.')}
        </p>
      </div>

      {field.fieldGroup ? (
        <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
          <p className="font-medium text-sm">{field.fieldGroup.name}</p>
          <p className="mt-1 text-muted-foreground text-xs">
            {groupMemberCount} {groupMemberCount === 1 ? _('option') : _('options')}
          </p>
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
                  groupName.trim() || (field.type === FieldType.RADIO ? _('Radio group') : _('Checkbox group')),
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
