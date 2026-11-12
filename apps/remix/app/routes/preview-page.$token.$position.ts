import { MAX_PREVIEW_PAGES, getEnvelopePreviewPage } from '@documenso/lib/server-only/envelope/envelope-preview';
import { extractRequestMetadata } from '@documenso/lib/universal/extract-request-metadata';

import type { Route } from './+types/preview-page.$token.$position';

const responseHeaders = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
};

export async function loader({ params, request }: Route.LoaderArgs) {
  const { token, position } = params;
  const pagePosition = Number(position);
  const destination = request.headers.get('Sec-Fetch-Dest');
  const revision = new URL(request.url).searchParams.get('v');

  if (
    !/^[a-f0-9]{64}$/.test(token) ||
    !/^[1-9]\d*$/.test(position) ||
    pagePosition > MAX_PREVIEW_PAGES ||
    !revision ||
    !/^[a-f0-9]{64}$/.test(revision) ||
    (destination !== null && destination !== 'image' && destination !== 'empty')
  ) {
    throw new Response(null, { status: 404, headers: responseHeaders });
  }

  const image = await getEnvelopePreviewPage(token, pagePosition, revision, extractRequestMetadata(request));

  if (!image) {
    throw new Response(null, { status: 404, headers: responseHeaders });
  }

  return new Response(new Uint8Array(image), {
    headers: { ...responseHeaders, 'Content-Type': 'image/jpeg' },
  });
}
