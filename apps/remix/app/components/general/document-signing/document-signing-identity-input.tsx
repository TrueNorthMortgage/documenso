import { Input } from '@documenso/ui/primitives/input';
import { Label } from '@documenso/ui/primitives/label';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useId, useState } from 'react';

type DocumentSigningIdentityInputProps = {
  value: string;
  label: React.ReactNode;
  onUpdate: (value: string) => Promise<void>;
  disabled?: boolean;
};

export const DocumentSigningIdentityInput = ({
  value,
  label,
  onUpdate,
  disabled,
}: DocumentSigningIdentityInputProps) => {
  const id = useId();
  const { t } = useLingui();
  const { toast } = useToast();
  const [draft, setDraft] = useState(value);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const update = async () => {
    const nextValue = draft.trim();
    setDraft(nextValue);

    if (isUpdating || nextValue === value) {
      return;
    }

    if (!nextValue) {
      setDraft(value);
      return;
    }

    setIsUpdating(true);

    try {
      await onUpdate(nextValue);
    } catch {
      toast({
        title: t`Error`,
        description: t`An error occurred while signing the document.`,
        variant: 'destructive',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        className="mt-2 min-w-0 bg-background"
        value={draft}
        autoComplete="off"
        aria-busy={isUpdating}
        disabled={disabled || isUpdating}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void update()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
    </div>
  );
};
