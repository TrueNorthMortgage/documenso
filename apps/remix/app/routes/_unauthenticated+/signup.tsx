import {
  IS_GOOGLE_SSO_ENABLED,
  IS_MICROSOFT_SSO_ENABLED,
  IS_OIDC_SSO_ENABLED,
  isSignupEnabledForProvider,
} from '@documenso/lib/constants/auth';
import { isValidReturnTo, normalizeReturnTo } from '@documenso/lib/utils/is-valid-return-to';
import { Button } from '@documenso/ui/primitives/button';
import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { Link } from 'react-router';

import { SignUpForm } from '~/components/forms/signup';
import { appMetaTags } from '~/utils/meta';

import type { Route } from './+types/signup';

export function meta() {
  return appMetaTags(msg`Sign Up`);
}

export function loader({ request }: Route.LoaderArgs) {
  const isEmailPasswordSignupEnabled = isSignupEnabledForProvider('email');
  const isGoogleSignupEnabled = IS_GOOGLE_SSO_ENABLED && isSignupEnabledForProvider('google');
  const isMicrosoftSignupEnabled = IS_MICROSOFT_SSO_ENABLED && isSignupEnabledForProvider('microsoft');
  const isOidcSignupEnabled = IS_OIDC_SSO_ENABLED && isSignupEnabledForProvider('oidc');

  let returnTo = new URL(request.url).searchParams.get('returnTo') ?? undefined;

  returnTo = isValidReturnTo(returnTo) ? normalizeReturnTo(returnTo) : undefined;

  return {
    isEmailPasswordSignupEnabled,
    isGoogleSignupEnabled,
    isMicrosoftSignupEnabled,
    isOidcSignupEnabled,
    returnTo,
  };
}

export default function SignUp({ loaderData }: Route.ComponentProps) {
  const {
    isEmailPasswordSignupEnabled,
    isGoogleSignupEnabled,
    isMicrosoftSignupEnabled,
    isOidcSignupEnabled,
    returnTo,
  } = loaderData;

  if (!isEmailPasswordSignupEnabled) {
    return (
      <div className="w-screen max-w-lg px-4 text-center">
        <h1 className="font-semibold text-2xl">
          <Trans>Email sign-up is disabled</Trans>
        </h1>

        <p className="mt-2 text-muted-foreground text-sm">
          <Trans>Creating an account with email and password is not available. Please use Login to continue.</Trans>
        </p>

        <Button size="lg" className="mt-6 w-full max-w-64" asChild>
          <Link
            to={returnTo ? `/signin?auto_oidc=true&returnTo=${encodeURIComponent(returnTo)}` : '/signin?auto_oidc=true'}
          >
            <Trans>Login</Trans>
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <SignUpForm
      className="w-screen max-w-screen-2xl px-4 md:px-16 lg:-my-16"
      isEmailPasswordSignupEnabled={isEmailPasswordSignupEnabled}
      isGoogleSignupEnabled={isGoogleSignupEnabled}
      isMicrosoftSignupEnabled={isMicrosoftSignupEnabled}
      isOidcSignupEnabled={isOidcSignupEnabled}
      returnTo={returnTo}
    />
  );
}
