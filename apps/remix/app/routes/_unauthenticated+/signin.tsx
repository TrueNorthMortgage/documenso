import { getOptionalSession } from '@documenso/auth/server/lib/utils/get-session';
import { IS_OIDC_SSO_ENABLED } from '@documenso/lib/constants/auth';
import { isValidReturnTo, normalizeReturnTo } from '@documenso/lib/utils/is-valid-return-to';
import { Alert, AlertDescription } from '@documenso/ui/primitives/alert';
import { Button } from '@documenso/ui/primitives/button';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { useEffect } from 'react';
import { redirect, useSearchParams } from 'react-router';

import { SIGNUP_ERROR_MESSAGES } from '~/components/forms/signup';
import { AppLogo } from '~/components/general/app-logo';
import { appMetaTags } from '~/utils/meta';
import {
  getSelfHostedReturnTargetFromParams,
  SELF_HOSTED_AUTO_OIDC_PARAM,
  SELF_HOSTED_RETURN_LABEL_PARAM,
  SELF_HOSTED_RETURN_URL_PARAM,
  storeSelfHostedReturnTarget,
} from '~/utils/self-hosted-return';

import type { Route } from './+types/signin';

export function meta() {
  return appMetaTags(msg`Sign In`);
}

export async function loader({ request }: Route.LoaderArgs) {
  const { isAuthenticated } = await getOptionalSession(request);
  const requestUrl = new URL(request.url);

  const isOIDCSSOEnabled = IS_OIDC_SSO_ENABLED;

  let returnTo = requestUrl.searchParams.get('returnTo') ?? undefined;

  returnTo = isValidReturnTo(returnTo) ? normalizeReturnTo(returnTo) : undefined;

  const selfHostedReturnTarget = getSelfHostedReturnTargetFromParams(requestUrl.searchParams, requestUrl.origin);

  if (!returnTo && selfHostedReturnTarget) {
    const returnUrl = new URL('/', requestUrl.origin);

    returnUrl.searchParams.set(SELF_HOSTED_RETURN_URL_PARAM, selfHostedReturnTarget.url);
    returnUrl.searchParams.set(SELF_HOSTED_RETURN_LABEL_PARAM, selfHostedReturnTarget.label);

    returnTo = `${returnUrl.pathname}${returnUrl.search}`;
  }

  if (!isAuthenticated && requestUrl.searchParams.get(SELF_HOSTED_AUTO_OIDC_PARAM) === 'true' && isOIDCSSOEnabled) {
    throw redirect(`/api/auth/oauth/authorize/oidc?redirectPath=${encodeURIComponent(returnTo || '/')}`);
  }

  if (isAuthenticated) {
    throw redirect(returnTo || '/');
  }

  return {
    isOIDCSSOEnabled,
    returnTo,
  };
}

export default function SignIn({ loaderData }: Route.ComponentProps) {
  const { isOIDCSSOEnabled, returnTo } = loaderData;

  const { _ } = useLingui();

  const [searchParams] = useSearchParams();

  const errorParam = searchParams.get('error');
  const signupError = errorParam ? SIGNUP_ERROR_MESSAGES[errorParam] : undefined;

  useEffect(() => {
    storeSelfHostedReturnTarget(getSelfHostedReturnTargetFromParams(searchParams, window.location.origin));
  }, [searchParams]);

  const loginUrl = `/api/auth/oauth/authorize/oidc?redirectPath=${encodeURIComponent(returnTo || '/')}`;

  return (
    <div className="flex w-screen max-w-lg flex-col items-center gap-8 px-4">
      {signupError && (
        <Alert variant="destructive">
          <AlertDescription>{_(signupError)}</AlertDescription>
        </Alert>
      )}

      <AppLogo className="h-auto w-64 max-w-full" />

      <Button
        size="lg"
        className="w-full max-w-64"
        disabled={!isOIDCSSOEnabled}
        onClick={() => window.location.assign(loginUrl)}
      >
        <Trans>Login</Trans>
      </Button>
    </div>
  );
}
