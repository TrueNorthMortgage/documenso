import {
  initializeBrowserRollbar,
  reportBrowserError,
  reportBrowserHydrationError,
} from '@documenso/lib/client-only/rollbar';
import { extractPostHogConfig } from '@documenso/lib/constants/feature-flags';
import { env } from '@documenso/lib/utils/env';
import { dynamicActivate } from '@documenso/lib/utils/i18n';
import { i18n } from '@lingui/core';
import { detect, fromHtmlTag } from '@lingui/detect-locale';
import { I18nProvider } from '@lingui/react';
import { StrictMode, startTransition, useEffect } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';

import './utils/polyfills/promise-with-resolvers';

function PosthogInit() {
  const postHogConfig = extractPostHogConfig();

  useEffect(() => {
    if (postHogConfig) {
      void import('posthog-js').then(({ default: posthog }) => {
        posthog.init(postHogConfig.key, {
          api_host: postHogConfig.host,
          capture_exceptions: !env('NEXT_PUBLIC_ROLLBAR_ACCESS_TOKEN'),
        });
      });
    }
  }, []);

  return null;
}

async function main() {
  initializeBrowserRollbar();

  const locale = detect(fromHtmlTag('lang')) || 'en';

  await dynamicActivate(locale);

  startTransition(() => {
    hydrateRoot(
      document,
      <StrictMode>
        <I18nProvider i18n={i18n}>
          <HydratedRouter onError={reportBrowserError} />
        </I18nProvider>

        <PosthogInit />
      </StrictMode>,
      { onRecoverableError: reportBrowserHydrationError },
    );
  });
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
