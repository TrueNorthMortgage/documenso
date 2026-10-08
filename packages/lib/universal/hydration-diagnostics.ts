import { z } from 'zod';

import { SUPPORTED_LANGUAGE_CODES } from '../constants/locales';

const ZTimeZone = z
  .string()
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  });

const ZTheme = z.enum(['light', 'dark', 'system']).nullable();
const ZNodeName = z.enum([
  'html',
  'head',
  'body',
  'meta',
  'link',
  'script',
  'style',
  'title',
  'div',
  'main',
  'header',
  'footer',
  'nav',
  'section',
  'noscript',
  'template',
  'comment',
  'text',
  'doctype',
  'other',
]);
// The SDK's deep merge turns custom arrays into numeric-keyed objects.
// Store a bounded tag sequence as text so both SDKs preserve it identically.
const ZNodeSequence = z
  .string()
  .max(600)
  .refine((value) => {
    if (!value) {
      return true;
    }
    const names = value.split(',');
    return names.length <= 60 && names.every((name) => ZNodeName.safeParse(name).success);
  });

// Reconstruct the approved fields on every SDK sanitization pass; never forward arbitrary metadata.
export const ZHydrationDiagnostics = z.object({
  routeId: z
    .string()
    .max(160)
    .regex(/^(root|routes\/[A-Za-z0-9_+.$/-]+)$/)
    .nullable(),
  requestId: z.string().uuid().nullable(),
  serverLanguage: z.enum(SUPPORTED_LANGUAGE_CODES).nullable(),
  clientLanguage: z.enum(SUPPORTED_LANGUAGE_CODES).nullable(),
  serverTheme: ZTheme,
  documentTheme: ZTheme,
  preferredColorScheme: z.enum(['light', 'dark']),
  documentNodes: ZNodeSequence,
  htmlNodes: ZNodeSequence.optional(),
  headNodes: ZNodeSequence,
  bodyNodes: ZNodeSequence,
  serverTimeZone: ZTimeZone.nullable().optional(),
  clientTimeZone: ZTimeZone.optional(),
  dateTimeZone: ZTimeZone.optional(),
  mismatchedDateFields: z.enum(['', 'createdAt', 'updatedAt', 'createdAt,updatedAt']).optional(),
  mismatchKind: z.enum(['formatted-date', 'text', 'structure', 'recovery', 'unknown']).optional(),
  componentNames: z
    .string()
    .max(6000)
    .regex(/^[A-Za-z0-9_$.,-]*$/)
    .optional(),
});

export type HydrationDiagnostics = z.infer<typeof ZHydrationDiagnostics>;

export const sanitizeHydrationDiagnostics = (value: unknown): HydrationDiagnostics | undefined => {
  const result = ZHydrationDiagnostics.safeParse(value);
  return result.success ? result.data : undefined;
};

export const getHydrationNodeName = (nodeName: string) => {
  const normalizedName = nodeName.toLowerCase().replace(/^#/, '');
  const result = ZNodeName.safeParse(normalizedName);
  return result.success ? result.data : 'other';
};
