import { validateNumberField } from '@documenso/lib/advanced-fields-validation/validate-number';
import { validateTextField } from '@documenso/lib/advanced-fields-validation/validate-text';
import type { TFieldNumber, TFieldText } from '@documenso/lib/types/field';
import { Input } from '@documenso/ui/primitives/input';
import { FieldType } from '@prisma/client';
import { useEffect, useRef, useState } from 'react';

type InlineField = TFieldText | TFieldNumber;
type InlineFieldDirection = 'next' | 'previous' | null;

type InlineFieldEditorProps = {
  field: InlineField;
  scale: number;
  pageHeight: number;
  pageWidth: number;
  onCancel: () => void;
  onCommit: (value: string, direction: InlineFieldDirection) => Promise<void>;
};

const getFieldErrors = (field: InlineField, value: string) => {
  const errors =
    field.type === FieldType.TEXT
      ? validateTextField(value, field.fieldMeta, true)
      : validateNumberField(value, field.fieldMeta, true);

  return errors;
};

export const InlineFieldEditor = ({
  field,
  pageHeight,
  pageWidth,
  scale,
  onCancel,
  onCommit,
}: InlineFieldEditorProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const commitStartedRef = useRef(false);
  const initialValue = field.inserted ? field.customText : '';
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    inputRef.current?.focus();

    const input = inputRef.current;

    if (input) {
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }, []);

  const commit = async (direction: InlineFieldDirection = null) => {
    if (commitStartedRef.current) {
      return;
    }

    const errors = getFieldErrors(field, value);

    if (errors.length > 0) {
      setError(errors[0] ?? null);
      inputRef.current?.focus();
      return;
    }

    commitStartedRef.current = true;

    try {
      await onCommit(value, direction);
    } catch {
      commitStartedRef.current = false;
    }
  };

  return (
    <form
      className="pointer-events-auto absolute z-20"
      style={{
        top: `${(Number(field.positionY) / 100) * pageHeight * scale}px`,
        left: `${(Number(field.positionX) / 100) * pageWidth * scale}px`,
        width: `${(Number(field.width) / 100) * pageWidth * scale}px`,
        height: `${(Number(field.height) / 100) * pageHeight * scale}px`,
      }}
      onSubmit={(event) => {
        event.preventDefault();
        void commit();
      }}
    >
      <Input
        ref={inputRef}
        aria-label={field.fieldMeta.label || `${field.type} field`}
        aria-invalid={Boolean(error)}
        autoComplete="off"
        className="h-full rounded border-2 border-green-500 bg-white px-2 py-0 text-black shadow-none placeholder:text-black focus-visible:ring-2"
        inputMode={field.type === FieldType.NUMBER ? 'decimal' : 'text'}
        placeholder={field.fieldMeta.placeholder}
        style={{
          fontSize: `${Math.max(8, Number(field.fieldMeta.fontSize ?? 12) * scale)}px`,
          textAlign: field.fieldMeta.textAlign,
        }}
        type="text"
        value={value}
        onBlur={(event) => {
          if (value === initialValue) {
            onCancel();
            return;
          }

          event.currentTarget.form?.requestSubmit();
        }}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Tab') {
            event.preventDefault();
            void commit(event.shiftKey ? 'previous' : 'next');
          }

          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
      />

      {error && (
        <p
          role="alert"
          className="pointer-events-none absolute top-full left-0 z-30 mt-1 w-max max-w-64 rounded border border-red-500 bg-white px-1.5 py-1 text-red-600 text-xs shadow-sm"
        >
          {error}
        </p>
      )}
    </form>
  );
};
