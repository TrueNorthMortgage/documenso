export const SELF_HOSTED_RETURN_URL_PARAM = 'return_url';
export const SELF_HOSTED_RETURN_LABEL_PARAM = 'return_label';
export const SELF_HOSTED_AUTO_OIDC_PARAM = 'auto_oidc';

const SELF_HOSTED_RETURN_URL_STORAGE_KEY = 'documenso_return_url';
const SELF_HOSTED_RETURN_LABEL_STORAGE_KEY = 'documenso_return_label';

export type SelfHostedReturnTarget = {
  url: string;
  label: string;
};

export const normalizeSelfHostedReturnUrl = (value: string | null | undefined, origin: string) => {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value, origin);

    if (url.origin !== origin || !url.pathname.startsWith('/r/')) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
};

export const getSelfHostedReturnTargetFromParams = (params: URLSearchParams, origin: string) => {
  const directReturnUrl = normalizeSelfHostedReturnUrl(params.get(SELF_HOSTED_RETURN_URL_PARAM), origin);

  if (directReturnUrl) {
    return {
      url: directReturnUrl,
      label: params.get(SELF_HOSTED_RETURN_LABEL_PARAM) || 'Close Documenso',
    };
  }

  const returnTo = params.get('returnTo');

  if (!returnTo) {
    return null;
  }

  try {
    const returnToUrl = new URL(returnTo, origin);
    const nestedReturnUrl = normalizeSelfHostedReturnUrl(
      returnToUrl.searchParams.get(SELF_HOSTED_RETURN_URL_PARAM),
      origin,
    );

    if (!nestedReturnUrl) {
      return null;
    }

    return {
      url: nestedReturnUrl,
      label: returnToUrl.searchParams.get(SELF_HOSTED_RETURN_LABEL_PARAM) || 'Close Documenso',
    };
  } catch {
    return null;
  }
};

export const getSelfHostedReturnTargetFromLocation = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  return getSelfHostedReturnTargetFromParams(new URLSearchParams(window.location.search), window.location.origin);
};

export const storeSelfHostedReturnTarget = (target: SelfHostedReturnTarget | null) => {
  if (typeof window === 'undefined') {
    return;
  }

  if (!target) {
    window.sessionStorage.removeItem(SELF_HOSTED_RETURN_URL_STORAGE_KEY);
    window.sessionStorage.removeItem(SELF_HOSTED_RETURN_LABEL_STORAGE_KEY);
    return;
  }

  window.sessionStorage.setItem(SELF_HOSTED_RETURN_URL_STORAGE_KEY, target.url);
  window.sessionStorage.setItem(SELF_HOSTED_RETURN_LABEL_STORAGE_KEY, target.label);
};

export const getStoredSelfHostedReturnTarget = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  const url = normalizeSelfHostedReturnUrl(
    window.sessionStorage.getItem(SELF_HOSTED_RETURN_URL_STORAGE_KEY),
    window.location.origin,
  );

  if (!url) {
    storeSelfHostedReturnTarget(null);
    return null;
  }

  return {
    url,
    label: window.sessionStorage.getItem(SELF_HOSTED_RETURN_LABEL_STORAGE_KEY) || 'Close Documenso',
  };
};
