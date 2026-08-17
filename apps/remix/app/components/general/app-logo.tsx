import {
  BRAND_CERTIFICATE_LOGO_URL,
  BRAND_LOGO_DARK_URL,
  BRAND_LOGO_ICON_DARK_URL,
  BRAND_LOGO_ICON_LIGHT_URL,
  BRAND_LOGO_LIGHT_URL,
} from '@documenso/lib/constants/app';
import { cn } from '@documenso/ui/lib/utils';
import type { ImgHTMLAttributes } from 'react';

type AppLogoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'alt' | 'src'> & {
  alt?: string;
  variant?: 'full' | 'icon' | 'certificate';
};

export const AppLogo = ({ alt, className, variant = 'full', ...props }: AppLogoProps) => {
  const lightLogo =
    variant === 'certificate'
      ? BRAND_CERTIFICATE_LOGO_URL
      : variant === 'icon'
        ? BRAND_LOGO_ICON_LIGHT_URL
        : BRAND_LOGO_LIGHT_URL;
  const darkLogo = variant === 'icon' ? BRAND_LOGO_ICON_DARK_URL : BRAND_LOGO_DARK_URL;

  if (variant === 'certificate') {
    return <img {...props} src={lightLogo} alt={alt ?? 'True North Mortgage'} className={className} />;
  }

  const logoAlt = alt ?? 'True North Mortgage';

  return (
    <span className={cn('inline-flex shrink-0', className)}>
      {lightLogo && (
        <img
          {...props}
          src={lightLogo}
          alt={logoAlt}
          className={cn('block h-full w-auto max-w-full', darkLogo && 'dark:hidden')}
        />
      )}
      {darkLogo && (
        <img {...props} src={darkLogo} alt={logoAlt} className="hidden h-full w-auto max-w-full dark:block" />
      )}
    </span>
  );
};
