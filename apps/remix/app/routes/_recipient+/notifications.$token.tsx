import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { optInRecipientNotifications } from '@documenso/lib/server-only/recipient/opt-in-recipient-notifications';
import { optOutRecipientNotifications } from '@documenso/lib/server-only/recipient/opt-out-recipient-notifications';
import { extractRequestMetadata } from '@documenso/lib/universal/extract-request-metadata';
import { prisma } from '@documenso/prisma';
import { Button } from '@documenso/ui/primitives/button';
import { Trans } from '@lingui/react/macro';
import { DocumentStatus, EnvelopeType, RecipientRole, SigningStatus } from '@prisma/client';
import { data, Form, useNavigation } from 'react-router';
import { z } from 'zod';

import type { Route } from './+types/notifications.$token';

export const headers = () => ({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });

export async function loader({ params }: Route.LoaderArgs) {
  const recipient = await prisma.recipient.findFirst({
    where: { token: params.token, envelope: { deletedAt: null } },
    select: {
      notificationsOptedOutAt: true,
      signingStatus: true,
      role: true,
      envelope: { select: { status: true, type: true } },
    },
  });

  if (!recipient) {
    throw new Response('Not Found', { status: 404 });
  }

  return {
    hasOptedOut: recipient.notificationsOptedOutAt !== null,
    optedOutAt: recipient.notificationsOptedOutAt?.toISOString() ?? null,
    canChangeReminders:
      recipient.envelope.status === DocumentStatus.PENDING &&
      recipient.envelope.type === EnvelopeType.DOCUMENT &&
      recipient.signingStatus === SigningStatus.NOT_SIGNED &&
      recipient.role !== RecipientRole.CC,
  };
}

export async function action({ params, request }: Route.ActionArgs) {
  if (request.method !== 'POST') {
    throw new Response('Method Not Allowed', { status: 405 });
  }

  const formData = await request.formData();
  const parsed = ZNotificationPreferenceFormSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    throw new Response('Invalid request', { status: 400 });
  }

  try {
    if (parsed.data.intent === 'resume') {
      await optInRecipientNotifications({
        token: params.token,
        optedOutAt: new Date(parsed.data.optedOutAt),
        requestMetadata: extractRequestMetadata(request),
      });
    } else {
      await optOutRecipientNotifications({ token: params.token, requestMetadata: extractRequestMetadata(request) });
    }
  } catch (err) {
    const error = AppError.parseError(err);

    if (error.code === AppErrorCode.NOT_FOUND) {
      throw new Response('Not Found', { status: 404 });
    }

    if (error.code === AppErrorCode.INVALID_REQUEST) {
      return data({ error: error.userMessage, hasOptedOut: null }, { status: 409 });
    }

    throw error;
  }

  return { error: null, hasOptedOut: parsed.data.intent === 'opt-out' };
}

export const NotificationPreferencesPage = ({ loaderData, actionData }: Route.ComponentProps) => {
  const navigation = useNavigation();
  const hasOptedOut = loaderData.hasOptedOut;
  const isSubmitting = navigation.state !== 'idle';

  return (
    <div className="mx-auto max-w-lg rounded-lg border bg-background p-6 text-center">
      <h1 className="font-semibold text-2xl">
        <Trans>Signing envelope reminders</Trans>
      </h1>

      {actionData?.error && (
        <p role="alert" className="mt-4 text-destructive text-sm">
          {actionData.error}
        </p>
      )}

      {!loaderData.canChangeReminders ? (
        <p className="mt-4 text-muted-foreground">
          <Trans>This envelope no longer requires your action. Reminder preferences cannot be changed.</Trans>
        </p>
      ) : hasOptedOut ? (
        <>
          <p className="mt-4 text-muted-foreground">
            <Trans>You will no longer receive automatic or manually sent reminders for this signing envelope.</Trans>
          </p>
          {loaderData.optedOutAt && (
            <Form method="post" className="mt-6">
              <input type="hidden" name="intent" value="resume" />
              <input type="hidden" name="optedOutAt" value={loaderData.optedOutAt} />
              <fieldset disabled={isSubmitting}>
                <Button type="submit" loading={isSubmitting} className="h-auto whitespace-normal">
                  <Trans>Resume reminders for this envelope</Trans>
                </Button>
              </fieldset>
            </Form>
          )}
        </>
      ) : (
        <>
          {actionData?.hasOptedOut === false && (
            <p role="status" className="mt-4 text-muted-foreground">
              <Trans>Reminders are enabled again for this signing envelope.</Trans>
            </p>
          )}
          <p className="mt-4 text-muted-foreground">
            <Trans>Stop automatic and manually sent reminders for this signing envelope only.</Trans>
          </p>
          <p className="mt-2 text-muted-foreground text-sm">
            <Trans>You can still open and sign the envelope using your original email link.</Trans>
          </p>
          <p className="mt-2 text-muted-foreground text-sm">
            <Trans>You will still receive correction and completion emails.</Trans>
          </p>
          <Form method="post" className="mt-6">
            <input type="hidden" name="intent" value="opt-out" />
            <fieldset disabled={isSubmitting}>
              <Button type="submit" loading={isSubmitting} className="h-auto whitespace-normal">
                <Trans>Do not notify me about this signing envelope again</Trans>
              </Button>
            </fieldset>
          </Form>
        </>
      )}
    </div>
  );
};

export default NotificationPreferencesPage;

const ZNotificationPreferenceFormSchema = z.discriminatedUnion('intent', [
  z.object({ intent: z.literal('opt-out') }),
  z.object({ intent: z.literal('resume'), optedOutAt: z.string().datetime() }),
]);
