export const SIGNATURE_CANVAS_DPI = 2;
export const SIGNATURE_MIN_COVERAGE_THRESHOLD = 0.01;

export const SIGNATURE_FONT_FAMILY_KEYS = ['caveat', 'dancingScript', 'kalam', 'pacifico', 'satisfy'] as const;

export const SIGNATURE_FONT_FAMILIES = {
  caveat: {
    label: 'Caveat',
    cssFamily: 'Caveat',
    fileName: 'caveat.ttf',
  },
  dancingScript: {
    label: 'Dancing Script',
    cssFamily: 'Dancing Script',
    fileName: 'dancing-script.ttf',
  },
  kalam: {
    label: 'Kalam',
    cssFamily: 'Kalam',
    fileName: 'kalam.ttf',
  },
  pacifico: {
    label: 'Pacifico',
    cssFamily: 'Pacifico',
    fileName: 'pacifico.ttf',
  },
  satisfy: {
    label: 'Satisfy',
    cssFamily: 'Satisfy',
    fileName: 'satisfy.ttf',
  },
} as const;

export type SignatureFontFamily = (typeof SIGNATURE_FONT_FAMILY_KEYS)[number];

export const DEFAULT_SIGNATURE_FONT_FAMILY: SignatureFontFamily = 'caveat';

export const isSignatureFontFamily = (value: string | null | undefined): value is SignatureFontFamily => {
  return value !== null && value !== undefined && Object.hasOwn(SIGNATURE_FONT_FAMILIES, value);
};

export const getSignatureFontFamily = (value?: string | null) => {
  return SIGNATURE_FONT_FAMILIES[isSignatureFontFamily(value) ? value : DEFAULT_SIGNATURE_FONT_FAMILY];
};

export const isBase64Image = (value: string) => value.startsWith('data:image/png;base64,');
