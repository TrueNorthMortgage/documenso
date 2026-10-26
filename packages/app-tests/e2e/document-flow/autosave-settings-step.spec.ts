import { getEnvelopeById } from '@documenso/lib/server-only/envelope/get-envelope-by-id';
import { seedBlankDocument } from '@documenso/prisma/seed/documents';
import { seedUser } from '@documenso/prisma/seed/users';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { EnvelopeType } from '@prisma/client';

import { apiSignin } from '../fixtures/authentication';

test.describe.configure({ mode: 'parallel', timeout: 60000 });

const setupDocument = async (page: Page) => {
  const { user, team } = await seedUser();

  const document = await seedBlankDocument(user, team.id);

  await apiSignin({
    page,
    email: user.email,
    redirectPath: `/t/${team.url}/documents/${document.id}/edit`,
  });

  return { user, team, document };
};

const changeSettingsAndWaitForSave = async (page: Page, change: () => Promise<void>) => {
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes('/api/trpc/document.update') && response.request().method() === 'POST',
    ),
    (async () => {
      await change();
      await page.keyboard.press('Tab');
    })(),
  ]);
  expect(response.ok()).toBe(true);
};

test.describe('AutoSave Settings Step', () => {
  test('should autosave the title change', async ({ page }) => {
    const { user, document, team } = await setupDocument(page);

    const newDocumentTitle = 'New Document Title';

    await changeSettingsAndWaitForSave(page, async () => {
      await page.getByRole('textbox', { name: 'Title *' }).fill(newDocumentTitle);
    });

    await expect(async () => {
      const retrieved = await getEnvelopeById({
        id: {
          type: 'envelopeId',
          id: document.id,
        },
        type: EnvelopeType.DOCUMENT,
        userId: user.id,
        teamId: team.id,
      });

      expect(retrieved.title).toBe(newDocumentTitle);
      await expect(page.getByRole('textbox', { name: 'Title *' })).toHaveValue(newDocumentTitle);
    }).toPass({ timeout: 10_000 });
  });

  test('should autosave the language change', async ({ page }) => {
    const { user, document, team } = await setupDocument(page);

    const newDocumentLanguage = 'French';
    const expectedLanguageCode = 'fr';

    await changeSettingsAndWaitForSave(page, async () => {
      await page.getByRole('combobox').first().click();
      await page.getByRole('option', { name: newDocumentLanguage }).click();
    });

    await expect(async () => {
      const retrieved = await getEnvelopeById({
        id: {
          type: 'envelopeId',
          id: document.id,
        },
        type: EnvelopeType.DOCUMENT,
        userId: user.id,
        teamId: team.id,
      });

      expect(retrieved.documentMeta?.language).toBe(expectedLanguageCode);
    }).toPass({ timeout: 10_000 });
  });

  test('should autosave the document access change', async ({ page }) => {
    const { user, document, team } = await setupDocument(page);

    const access = 'Require account';
    const accessValue = 'ACCOUNT';

    await changeSettingsAndWaitForSave(page, async () => {
      await page.getByRole('combobox').nth(1).click();
      await page.getByRole('option', { name: access }).click();
    });

    await expect(async () => {
      const retrieved = await getEnvelopeById({
        id: {
          type: 'envelopeId',
          id: document.id,
        },
        type: EnvelopeType.DOCUMENT,
        userId: user.id,
        teamId: team.id,
      });

      expect(retrieved.authOptions?.globalAccessAuth).toContain(accessValue);
    }).toPass({ timeout: 10_000 });
  });

  test('should autosave the external ID change', async ({ page }) => {
    const { user, document, team } = await setupDocument(page);

    const newExternalId = '1234567890';

    await changeSettingsAndWaitForSave(page, async () => {
      await page.getByRole('button', { name: 'Advanced Options' }).click();

      await page.getByRole('textbox', { name: 'External ID' }).fill(newExternalId);
    });

    await expect(async () => {
      const retrieved = await getEnvelopeById({
        id: {
          type: 'envelopeId',
          id: document.id,
        },
        type: EnvelopeType.DOCUMENT,
        userId: user.id,
        teamId: team.id,
      });

      expect(retrieved.externalId).toBe(newExternalId);
    }).toPass({ timeout: 10_000 });
  });

  test('should autosave the allowed signature types change', async ({ page }) => {
    const { user, document, team } = await setupDocument(page);

    await changeSettingsAndWaitForSave(page, async () => {
      await page.getByRole('button', { name: 'Advanced Options' }).click();

      await page.getByRole('combobox').nth(3).click();
      await page.getByRole('option', { name: 'Draw' }).click();
      await page.getByRole('option', { name: 'Type' }).click();
    });

    await expect(async () => {
      const retrieved = await getEnvelopeById({
        id: {
          type: 'envelopeId',
          id: document.id,
        },
        type: EnvelopeType.DOCUMENT,
        userId: user.id,
        teamId: team.id,
      });

      expect(retrieved.documentMeta?.drawSignatureEnabled).toBe(false);
      expect(retrieved.documentMeta?.typedSignatureEnabled).toBe(false);
      expect(retrieved.documentMeta?.uploadSignatureEnabled).toBe(true);
    }).toPass({ timeout: 10_000 });
  });

  test('should autosave the date format change', async ({ page }) => {
    const { user, document, team } = await setupDocument(page);

    await changeSettingsAndWaitForSave(page, async () => {
      await page.getByRole('button', { name: 'Advanced Options' }).click();

      await page.getByRole('combobox').nth(4).click();
      await page.getByRole('option', { name: 'ISO 8601', exact: true }).click();
    });

    await expect(async () => {
      const retrieved = await getEnvelopeById({
        id: {
          type: 'envelopeId',
          id: document.id,
        },
        type: EnvelopeType.DOCUMENT,
        userId: user.id,
        teamId: team.id,
      });

      expect(retrieved.documentMeta?.dateFormat).toBe("yyyy-MM-dd'T'HH:mm:ss.SSSXXX");
    }).toPass({ timeout: 10_000 });
  });

  test('should autosave the timezone change', async ({ page }) => {
    const { user, document, team } = await setupDocument(page);

    await changeSettingsAndWaitForSave(page, async () => {
      await page.getByRole('button', { name: 'Advanced Options' }).click();

      await page.getByRole('combobox').nth(5).click();
      await page.getByRole('option', { name: 'Europe/London' }).click();
    });

    await expect(async () => {
      const retrieved = await getEnvelopeById({
        id: {
          type: 'envelopeId',
          id: document.id,
        },
        type: EnvelopeType.DOCUMENT,
        userId: user.id,
        teamId: team.id,
      });

      expect(retrieved.documentMeta?.timezone).toBe('Europe/London');
    }).toPass({ timeout: 10_000 });
  });

  test('should autosave the redirect URL change', async ({ page }) => {
    const { user, document, team } = await setupDocument(page);

    const newRedirectUrl = 'https://documenso.com/test/';

    await changeSettingsAndWaitForSave(page, async () => {
      await page.getByRole('button', { name: 'Advanced Options' }).click();

      await page.getByRole('textbox', { name: 'Redirect URL' }).fill(newRedirectUrl);
    });

    await expect(async () => {
      const retrieved = await getEnvelopeById({
        id: {
          type: 'envelopeId',
          id: document.id,
        },
        type: EnvelopeType.DOCUMENT,
        userId: user.id,
        teamId: team.id,
      });

      expect(retrieved.documentMeta?.redirectUrl).toBe(newRedirectUrl);
    }).toPass({ timeout: 10_000 });
  });

  test('should autosave multiple field changes together', async ({ page }) => {
    const { user, document, team } = await setupDocument(page);

    const newTitle = 'Updated Document Title';
    const newExternalId = 'MULTI-TEST-123';
    await changeSettingsAndWaitForSave(page, async () => {
      await page.getByRole('textbox', { name: 'Title *' }).fill(newTitle);

      await page.getByRole('combobox').first().click();
      await page.getByRole('option', { name: 'German' }).click();

      await page.getByRole('combobox').nth(1).click();
      await page.getByRole('option', { name: 'Require account' }).click();

      await page.getByRole('button', { name: 'Advanced Options' }).click();
      await page.getByRole('textbox', { name: 'External ID' }).fill(newExternalId);

      await page.getByRole('combobox').nth(5).click();
      await page.getByRole('option', { name: 'Europe/Berlin' }).click();
    });

    await expect(async () => {
      const retrieved = await getEnvelopeById({
        id: {
          type: 'envelopeId',
          id: document.id,
        },
        type: EnvelopeType.DOCUMENT,
        userId: user.id,
        teamId: team.id,
      });

      expect(retrieved.title).toBe(newTitle);
      expect(retrieved.documentMeta?.language).toBe('de');
      expect(retrieved.authOptions?.globalAccessAuth).toContain('ACCOUNT');
      expect(retrieved.externalId).toBe(newExternalId);
      expect(retrieved.documentMeta?.timezone).toBe('Europe/Berlin');
    }).toPass({ timeout: 10_000 });
  });
});
