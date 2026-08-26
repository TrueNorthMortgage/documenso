import { Img } from '../components';
import { useBranding } from '../providers/branding';

const BRAND_LOGO_STYLES = `
  .brand-logo-light { display: block !important; }
  .brand-logo-dark { display: none !important; }

  @media (prefers-color-scheme: dark) {
    .brand-logo-light { display: none !important; }
    .brand-logo-dark { display: block !important; }
  }

  [data-ogsc] .brand-logo-light { display: none !important; }
  [data-ogsc] .brand-logo-dark { display: block !important; }
`;

export type TemplateBrandLogoProps = {
  assetBaseUrl: string;
  className?: string;
};

export const TemplateBrandLogoStyles = () => <style>{BRAND_LOGO_STYLES}</style>;

export const TemplateBrandLogo = ({ assetBaseUrl, className }: TemplateBrandLogoProps) => {
  const branding = useBranding();
  const logoAlt = 'True North Mortgage';

  const getAssetUrl = (path: string) => new URL(path, assetBaseUrl).toString();
  const hasCustomBranding = branding.brandingEnabled && branding.brandingLogo;
  const logoClassName = className ? `brand-logo ${className}` : 'brand-logo';
  const logoStyle = { height: '24px', maxWidth: '100%', width: 'auto' };

  if (hasCustomBranding) {
    return (
      <Img
        src={branding.brandingLogo}
        alt={logoAlt}
        className={logoClassName}
        height={24}
        style={{ ...logoStyle, display: 'block' }}
      />
    );
  }

  return (
    <>
      <Img
        src={getAssetUrl('/static/brand-logo-light.png')}
        alt={logoAlt}
        className={`brand-logo-light ${logoClassName}`}
        height={24}
        style={{ ...logoStyle, display: 'block' }}
      />
      <Img
        src={getAssetUrl('/static/brand-logo-dark.png')}
        alt={logoAlt}
        className={`brand-logo-dark ${logoClassName}`}
        height={24}
        style={{ ...logoStyle, display: 'none' }}
      />
    </>
  );
};

export default TemplateBrandLogo;
