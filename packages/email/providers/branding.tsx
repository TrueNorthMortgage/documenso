import { createContext, useContext } from 'react';

type BrandingContextValue = {
  brandingEnabled: boolean;
  brandingUrl: string;
  brandingLogo: string;
  brandingName: string;
  brandingCompanyDetails: string;
  brandingHidePoweredBy: boolean;
};

const BrandingContext = createContext<BrandingContextValue | undefined>(undefined);

const defaultBrandingName = 'True North Mortgage';

const defaultBrandingContextValue: BrandingContextValue = {
  brandingEnabled: false,
  brandingUrl: '',
  brandingLogo: '',
  brandingName: defaultBrandingName,
  brandingCompanyDetails: '',
  brandingHidePoweredBy: false,
};

export type BrandingSettings = Omit<BrandingContextValue, 'brandingName'> & {
  brandingName?: string;
};

export const BrandingProvider = (props: { branding?: BrandingSettings; children: React.ReactNode }) => {
  const branding: BrandingContextValue = {
    ...defaultBrandingContextValue,
    ...props.branding,
    brandingName: props.branding?.brandingName ?? defaultBrandingName,
  };

  return <BrandingContext.Provider value={branding}>{props.children}</BrandingContext.Provider>;
};

export const useBranding = () => {
  const ctx = useContext(BrandingContext);

  if (!ctx) {
    throw new Error('Branding context not found');
  }

  return ctx;
};
