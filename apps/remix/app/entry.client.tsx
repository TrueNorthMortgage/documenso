import { captureHydrationDiagnostics } from '@documenso/lib/client-only/hydration-diagnostics';
import {
  initializeBrowserRollbar,
  reportBrowserError,
  reportBrowserHydrationError,
} from '@documenso/lib/client-only/rollbar';
import { dynamicActivate } from '@documenso/lib/utils/i18n';
import { i18n } from '@lingui/core';
import { detect, fromHtmlTag } from '@lingui/detect-locale';
import { I18nProvider } from '@lingui/react';
import { StrictMode, startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';

import './utils/polyfills/promise-with-resolvers';

async function main() {
  const hydrationDiagnostics = captureHydrationDiagnostics(
    document,
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
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
      </StrictMode>,
      {
        onRecoverableError: (error, info) =>
          reportBrowserHydrationError(error, info, {
            ...hydrationDiagnostics,
            clientLanguage: i18n.locale,
          }),
      },
    );
  });
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
