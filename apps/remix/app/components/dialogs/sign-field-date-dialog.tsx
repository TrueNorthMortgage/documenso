import { DEFAULT_DOCUMENT_DATE_FORMAT, isDateFormatWithTime } from '@documenso/lib/constants/date-formats';
import type { TDateFieldMeta } from '@documenso/lib/types/field-meta';
import { Button } from '@documenso/ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@documenso/ui/primitives/dialog';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@documenso/ui/primitives/form/form';
import { Input } from '@documenso/ui/primitives/input';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { createCallable } from 'react-call';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

export type SignFieldDateDialogProps = {
  fieldMeta: TDateFieldMeta;
  dateFormat?: string | null;
  initialDate?: string;
};

export const SignFieldDateDialog = createCallable<SignFieldDateDialogProps, string | null>(
  ({ call, fieldMeta, dateFormat = DEFAULT_DOCUMENT_DATE_FORMAT, initialDate }) => {
    const { t } = useLingui();
    const ZSignFieldDateFormSchema = z.object({
      date: z.string().min(1, { message: t`Date is required` }),
    });

    const resolvedDateFormat = dateFormat ?? DEFAULT_DOCUMENT_DATE_FORMAT;
    const hasTime = isDateFormatWithTime(resolvedDateFormat);
    const hasSeconds = resolvedDateFormat.includes('s');
    const hasMilliseconds = resolvedDateFormat.includes('S');

    const form = useForm<z.infer<typeof ZSignFieldDateFormSchema>>({
      resolver: zodResolver(ZSignFieldDateFormSchema),
      defaultValues: {
        date: initialDate ?? '',
      },
    });

    return (
      <Dialog open={true} onOpenChange={(value) => (!value ? call.end(null) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{fieldMeta.label || <Trans>Enter Date</Trans>}</DialogTitle>
            <DialogDescription className="mt-4">
              {hasTime ? <Trans>Please select a date and time</Trans> : <Trans>Please select a date</Trans>}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => call.end(data.date))}>
              <fieldset className="flex h-full flex-col space-y-4" disabled={form.formState.isSubmitting}>
                <FormField
                  control={form.control}
                  name="date"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          type={hasTime ? 'datetime-local' : 'date'}
                          step={hasMilliseconds ? 0.001 : hasSeconds ? 1 : undefined}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <DialogFooter>
                  <Button type="button" variant="secondary" onClick={() => call.end(null)}>
                    <Trans>Cancel</Trans>
                  </Button>
                  <Button type="submit">
                    <Trans>Enter</Trans>
                  </Button>
                </DialogFooter>
              </fieldset>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    );
  },
);
