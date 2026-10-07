import { authClient } from '@documenso/auth/client';
import { AppError } from '@documenso/lib/errors/app-error';
import { zEmail } from '@documenso/lib/utils/zod';
import { cn } from '@documenso/ui/lib/utils';
import { Alert, AlertDescription } from '@documenso/ui/primitives/alert';
import { Button } from '@documenso/ui/primitives/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@documenso/ui/primitives/form/form';
import { Input } from '@documenso/ui/primitives/input';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';

export const ZForgotPasswordFormSchema = z.object({
  email: zEmail().min(1),
});

export type TForgotPasswordFormSchema = z.infer<typeof ZForgotPasswordFormSchema>;

export type ForgotPasswordFormProps = {
  className?: string;
};

export const ForgotPasswordForm = ({ className }: ForgotPasswordFormProps) => {
  const { _ } = useLingui();
  const { toast } = useToast();

  const navigate = useNavigate();
  const [hasSsoGuidance, setHasSsoGuidance] = useState(false);

  const form = useForm<TForgotPasswordFormSchema>({
    values: {
      email: '',
    },
    resolver: zodResolver(ZForgotPasswordFormSchema),
  });

  const isSubmitting = form.formState.isSubmitting;

  const onFormSubmit = async ({ email }: TForgotPasswordFormSchema) => {
    setHasSsoGuidance(false);

    try {
      const result = await authClient.emailPassword.forgotPassword({ email });

      if (result.usesSso) {
        setHasSsoGuidance(true);
        return;
      }
    } catch (err) {
      const error = AppError.parseError(err);

      toast({
        title: _(msg`Unable to reset password`),
        description:
          error.code === 'TOO_MANY_REQUESTS'
            ? _(msg`Too many requests. Please try again later.`)
            : _(msg`An error occurred. Please try again later.`),
        variant: 'destructive',
      });
      return;
    }

    await navigate('/check-email');

    toast({
      title: _(msg`Reset email sent`),
      description: _(
        msg`A password reset email has been sent, if you have an account you should see it in your inbox shortly.`,
      ),
      duration: 5000,
    });

    form.reset();
  };

  return (
    <Form {...form}>
      <form className={cn('flex w-full flex-col gap-y-4', className)} onSubmit={form.handleSubmit(onFormSubmit)}>
        <fieldset className="flex w-full flex-col gap-y-4" disabled={isSubmitting}>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <Trans>Email</Trans>
                </FormLabel>
                <FormControl>
                  <Input type="email" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>

        {hasSsoGuidance && (
          <Alert>
            <AlertDescription>
              <Trans>Your email domain uses Microsoft SSO. Please use the Login button on the main sign-in page.</Trans>{' '}
              <Link to="/signin" className="underline">
                <Trans>Go to sign-in</Trans>
              </Link>
            </AlertDescription>
          </Alert>
        )}

        <Button size="lg" loading={isSubmitting}>
          {isSubmitting ? <Trans>Checking...</Trans> : <Trans>Reset Password</Trans>}
        </Button>
      </form>
    </Form>
  );
};
