import { getEnvelopePreview } from '@documenso/lib/server-only/envelope/envelope-preview';
import { Trans } from '@lingui/react/macro';

import { AppLogo } from '~/components/general/app-logo';

import type { Route } from './+types/preview.$token';

export const headers: Route.HeadersFunction = () => ({
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
});

export async function loader({ params }: Route.LoaderArgs) {
  const { token } = params;
  const preview = /^[a-f0-9]{64}$/.test(token) ? await getEnvelopePreview(token) : null;

  return { preview: preview ?? null };
}

export default function EnvelopePreview({ loaderData, params }: Route.ComponentProps) {
  const { preview } = loaderData;

  return (
    <>
      <p className="hidden p-6 print:block">
        <Trans>Printing is disabled for this preview.</Trans>
      </p>
      <main className="min-h-screen bg-muted/30 px-4 py-6 print:hidden">
        <header className="mx-auto mb-6 flex max-w-3xl flex-col items-start gap-4">
          <AppLogo className="h-6 w-auto" />
          {preview && (
            <div>
              <p className="text-muted-foreground text-sm">
                <Trans>Document preview</Trans>
              </p>
              <h1 className="break-words font-semibold text-xl">{preview.title}</h1>
            </div>
          )}
        </header>

        {preview ? (
          <div className="mx-auto grid max-w-3xl gap-5">
            {preview.pages.map((page, index) => (
              <figure
                key={page.position}
                className="select-none space-y-2 [-webkit-touch-callout:none]"
                onContextMenu={(event) => event.preventDefault()}
              >
                <img
                  src={`/preview-page/${params.token}/${page.position}?v=${preview.revisionHash}`}
                  width={page.width}
                  height={page.height}
                  loading={index === 0 ? 'eager' : 'lazy'}
                  draggable={false}
                  alt={`${page.title} — ${page.number}`}
                  className="pointer-events-none h-auto w-full rounded-md border bg-white"
                />
                <figcaption className="text-center text-muted-foreground text-sm">
                  <Trans>
                    {page.title} · Page {page.number}
                  </Trans>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <div className="mx-auto max-w-3xl rounded-md border bg-background p-6">
            <h1 className="font-semibold text-lg">
              <Trans>This preview is unavailable</Trans>
            </h1>
            <p className="mt-1 text-muted-foreground text-sm">
              <Trans>Ask the sender to share the preview again.</Trans>
            </p>
          </div>
        )}
      </main>
    </>
  );
}
