import { useDebouncedValue } from '@documenso/lib/client-only/hooks/use-debounced-value';
import { trpc } from '@documenso/trpc/react';
import { Button } from '@documenso/ui/primitives/button';
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@documenso/ui/primitives/command';
import { FormControl } from '@documenso/ui/primitives/form/form';
import { Popover, PopoverContent, PopoverTrigger } from '@documenso/ui/primitives/popover';
import { Trans, useLingui } from '@lingui/react/macro';
import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react';
import { useState } from 'react';

type ReassignmentMemberComboboxProps = {
  teamId: number;
  excludeUserId?: number;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
};

export const ReassignmentMemberCombobox = ({
  teamId,
  excludeUserId,
  value,
  onChange,
  disabled,
}: ReassignmentMemberComboboxProps) => {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<{ id: number; name: string | null; email: string } | null>(null);
  const debouncedSearch = useDebouncedValue(search, 250);
  const {
    data: members,
    isFetching,
    isError,
  } = trpc.envelope.reassignmentCandidates.useQuery(
    { teamId, search: debouncedSearch.trim(), excludeUserId },
    { enabled: open && !disabled },
  );
  const isSearching = isFetching || search.trim() !== debouncedSearch.trim();

  return (
    <Popover
      open={open && !disabled}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setSearch('');
        }
      }}
    >
      <PopoverTrigger asChild>
        <FormControl>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between"
          >
            <span className="truncate">
              {selected?.id === value
                ? selected.name
                  ? `${selected.name} (${selected.email})`
                  : selected.email
                : t`Select a team member`}
            </span>
            <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </FormControl>
      </PopoverTrigger>
      <PopoverContent align="start" className="z-[1001] w-[var(--radix-popover-trigger-width)] p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t`Search members by name or email`}
            value={search}
            onValueChange={setSearch}
            maxLength={200}
          />
          <CommandList>
            {isSearching ? (
              <p role="status" className="p-4 text-sm">
                <Trans>Loading...</Trans>
              </p>
            ) : isError ? (
              <p role="alert" className="p-4 text-destructive text-sm">
                <Trans>Unable to load team members. Close this dialog and try again.</Trans>
              </p>
            ) : (
              <>
                {members?.length === 0 && (
                  <p role="status" className="p-4 text-center text-sm">
                    <Trans>No members found</Trans>
                  </p>
                )}
                <CommandGroup>
                  {members?.map((member) => (
                    <CommandItem
                      key={member.id}
                      value={String(member.id)}
                      onSelect={() => {
                        setSelected(member);
                        onChange(member.id);
                        setOpen(false);
                      }}
                    >
                      <CheckIcon
                        className={`mr-2 h-4 w-4 shrink-0 ${value === member.id ? 'opacity-100' : 'opacity-0'}`}
                      />
                      <span className="break-all">
                        {member.name ? `${member.name} (${member.email})` : member.email}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
          <p className="border-t p-2 text-muted-foreground text-xs">
            <Trans>Showing up to 15 members. Search to find others.</Trans>
          </p>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
