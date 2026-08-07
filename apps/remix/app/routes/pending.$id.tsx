import { getOptionalSession } from '@documenso/auth/server/lib/utils/get-session';
import { commitPendingPreparation } from '@documenso/lib/server-only/pending-preparation/commit-pending-preparation';
import { extractRequestMetadata } from '@documenso/lib/universal/extract-request-metadata';
import { prisma } from '@documenso/prisma';
import { Alert, AlertDescription } from '@documenso/ui/primitives/alert';
import { redirect } from 'react-router';

import type { Route } from './+types/pending.$id';

export async function loader({ request, params }: Route.LoaderArgs) {
  const session = await getOptionalSession(request);
  const returnTo = `/pending/${encodeURIComponent(params.id)}`;

  if (!session.isAuthenticated || !session.user) {
    throw redirect(`/signin?returnTo=${encodeURIComponent(returnTo)}&auto_oidc=true`);
  }

  try {
    const envelope = await commitPendingPreparation({
      id: params.id,
      userId: session.user.id,
      userEmail: session.user.email,
      requestMetadata: {
        requestMetadata: extractRequestMetadata(request),
        source: 'app',
        auth: 'session',
        auditUser: {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
        },
      },
    });
    const envelopeWithTeam = await prisma.envelope.findUnique({
      where: { id: envelope.id },
      select: { id: true, team: { select: { url: true } } },
    });

    if (!envelopeWithTeam) {
      throw new Error('Committed envelope was not found');
    }

    throw redirect(`/t/${envelopeWithTeam.team.url}/documents/${envelopeWithTeam.id}/edit`);
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }

    console.error('Unable to commit pending preparation', error);

    return {
      error: 'Unable to continue this document preparation. The request may be expired or unavailable.',
    };
  }
}

export default function PendingPreparation({ loaderData }: Route.ComponentProps) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <Alert variant="destructive">
        <AlertDescription>{loaderData.error}</AlertDescription>
      </Alert>
    </div>
  );
}
