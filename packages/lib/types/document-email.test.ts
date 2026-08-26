import { DocumentDistributionMethod, type DocumentMeta } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { extractDerivedDocumentEmailSettings, ZDocumentEmailSettingsSchema } from './document-email';

describe('document email settings', () => {
  it('enables recipient opened notifications for existing settings', () => {
    const settings = ZDocumentEmailSettingsSchema.parse({
      recipientSigned: false,
    });

    expect(settings.recipientOpened).toBe(true);
    expect(settings.recipientSigned).toBe(false);
  });

  it('disables recipient opened notifications for manual distribution', () => {
    const settings = extractDerivedDocumentEmailSettings({
      distributionMethod: DocumentDistributionMethod.NONE,
      emailSettings: {
        recipientOpened: true,
      },
    } as DocumentMeta);

    expect(settings.recipientOpened).toBe(false);
  });
});
