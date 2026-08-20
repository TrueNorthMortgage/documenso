import {
  type TDateFieldMeta as DateFieldMeta,
  DEFAULT_FIELD_FONT_SIZE,
  FIELD_DATE_META_DEFAULT_VALUES,
  FIELD_DEFAULT_GENERIC_ALIGN,
  ZDateFieldMeta,
} from '@documenso/lib/types/field-meta';
import { Checkbox } from '@documenso/ui/primitives/checkbox';
import { Form, FormControl, FormField, FormItem } from '@documenso/ui/primitives/form/form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trans } from '@lingui/react/macro';
import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';

import { EditorGenericFontSizeField, EditorGenericTextAlignField } from './editor-field-generic-field-forms';

const ZDateFieldFormSchema = ZDateFieldMeta.pick({
  autoFill: true,
  fontSize: true,
  textAlign: true,
  overflow: true,
});

type TDateFieldFormSchema = z.infer<typeof ZDateFieldFormSchema>;

type EditorFieldDateFormProps = {
  value: z.input<typeof ZDateFieldMeta> | undefined;
  onValueChange: (value: DateFieldMeta) => void;
};

export const EditorFieldDateForm = ({
  value = {
    type: 'date',
  },
  onValueChange,
}: EditorFieldDateFormProps) => {
  const form = useForm<TDateFieldFormSchema>({
    resolver: zodResolver(ZDateFieldFormSchema),
    mode: 'onChange',
    defaultValues: {
      autoFill: value.autoFill ?? FIELD_DATE_META_DEFAULT_VALUES.autoFill,
      fontSize: value.fontSize || DEFAULT_FIELD_FONT_SIZE,
      textAlign: value.textAlign ?? FIELD_DEFAULT_GENERIC_ALIGN,
      overflow: value.overflow || FIELD_DATE_META_DEFAULT_VALUES.overflow,
    },
  });

  const { control } = form;

  const formValues = useWatch({
    control,
  });

  // Dupecode/Inefficient: Done because native isValid won't work for our usecase.
  useEffect(() => {
    const validatedFormValues = ZDateFieldFormSchema.safeParse(formValues);

    if (validatedFormValues.success) {
      onValueChange({
        type: 'date',
        ...validatedFormValues.data,
      });
    }
  }, [formValues]);

  return (
    <Form {...form}>
      <form>
        <fieldset className="flex flex-col gap-2">
          <FormField
            control={form.control}
            name="autoFill"
            render={({ field }) => (
              <FormItem className="flex items-center space-x-2">
                <FormControl>
                  <div className="flex items-center">
                    <Checkbox id="field-date-auto-fill" checked={field.value} onCheckedChange={field.onChange} />
                    <label className="ml-2 text-muted-foreground text-sm" htmlFor="field-date-auto-fill">
                      <Trans>Auto-fill current date</Trans>
                    </label>
                  </div>
                </FormControl>
              </FormItem>
            )}
          />

          <EditorGenericFontSizeField formControl={form.control} />

          <EditorGenericTextAlignField formControl={form.control} />
        </fieldset>
      </form>
    </Form>
  );
};
