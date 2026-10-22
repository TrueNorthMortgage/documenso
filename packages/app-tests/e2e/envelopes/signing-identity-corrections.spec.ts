import { prisma } from '@documenso/prisma';
import { expect, type Page, test } from '@playwright/test';
import { FieldType } from '@prisma/client';

import { apiSeedPendingDocument } from '../fixtures/api-seeds';

for (const mobile of [false, true]) {
  test.describe(mobile ? 'Mobile signing identity corrections' : 'Desktop signing identity corrections', () => {
    test.use({ viewport: mobile ? { width: 390, height: 844 } : { width: 1920, height: 1200 } });

    const settings = async (page: Page, open: boolean) => {
      if (mobile) {
        await page.getByRole('button', { name: open ? 'Expand' : 'Collapse', exact: true }).click();
      }
    };

    const signature = async (page: Page, value: string) => {
      await page.getByTestId('signature-pad-dialog-button').filter({ visible: true }).click();
      await page.getByRole('tab', { name: 'Type', exact: true }).click();
      await page.getByTestId('signature-pad-type-input').fill(value);
      await page.getByRole('button', { name: 'Next', exact: true }).click();
    };

    test('corrects filled initials, names and signatures without inserting empty fields', async ({ page, request }) => {
      test.setTimeout(120_000);
      const types = [
        FieldType.NAME,
        FieldType.NAME,
        FieldType.INITIALS,
        FieldType.INITIALS,
        FieldType.SIGNATURE,
        FieldType.SIGNATURE,
      ];
      const { envelope, distributeResult } = await apiSeedPendingDocument(request, {
        recipients: [{ email: 'identity-corrections@test.documenso.com', name: 'Tom' }],
        fieldsPerRecipient: [
          types.map((type, index) => ({
            type,
            page: 1,
            positionX: 10,
            positionY: 8 + index * 10,
            width: 25,
            height: 6,
          })),
        ],
      });
      await page.goto(`/sign/${distributeResult.recipients[0].token}`);
      const canvas = page.locator('.konva-container canvas').first();
      await expect(canvas).toBeVisible({ timeout: 30_000 });
      const fields = [...envelope.fields].sort((a, b) => Number(a.positionY) - Number(b.positionY));
      const clickField = async (index: number) => {
        const box = await canvas.boundingBox();
        if (!box) {
          throw new Error('Missing signing canvas');
        }
        const field = fields[index];
        await canvas.click({
          position: {
            x: ((Number(field.positionX) + Number(field.width) / 2) / 100) * box.width,
            y: ((Number(field.positionY) + Number(field.height) / 2) / 100) * box.height,
          },
        });
      };
      const fieldValue = async (index: number) =>
        prisma.field.findUniqueOrThrow({ where: { id: fields[index].id }, include: { signature: true } });

      await clickField(2);
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByLabel('Initials', { exact: true })).toHaveValue('T');
      await dialog.getByLabel('Initials', { exact: true }).fill('TW');
      await dialog.getByRole('button', { name: 'Enter', exact: true }).click();
      await expect.poll(async () => (await fieldValue(2)).customText).toBe('TW');

      await settings(page, true);
      const initials = page.getByLabel('Initials', { exact: true }).filter({ visible: true });
      await expect(initials).toHaveValue('TW');
      await initials.fill('TX');
      await initials.press('Tab');
      await expect.poll(async () => (await fieldValue(2)).customText).toBe('TX');
      expect((await fieldValue(3)).inserted).toBe(false);

      const name = page.getByLabel('Full Name', { exact: true }).filter({ visible: true });
      await name.fill('Tom Williams');
      await name.press('Tab');
      await expect(name).toBeEnabled();
      expect((await fieldValue(0)).inserted).toBe(false);
      expect((await fieldValue(1)).inserted).toBe(false);
      await settings(page, false);
      await clickField(0);
      await expect.poll(async () => (await fieldValue(0)).customText).toBe('Tom Williams');

      await settings(page, true);
      await name.fill('Tom Wilson');
      await name.press('Tab');
      await expect.poll(async () => (await fieldValue(0)).customText).toBe('Tom Wilson');
      expect((await fieldValue(1)).inserted).toBe(false);
      expect((await fieldValue(2)).customText).toBe('TX');

      await signature(page, 'Original');
      await settings(page, false);
      await clickField(4);
      await expect.poll(async () => (await fieldValue(4)).signature?.typedSignature).toBe('Original');
      await settings(page, true);
      await signature(page, 'Corrected');
      await expect.poll(async () => (await fieldValue(4)).signature?.typedSignature).toBe('Corrected');
      expect((await fieldValue(5)).inserted).toBe(false);
      await settings(page, false);
      await clickField(3);
      await expect.poll(async () => (await fieldValue(3)).customText).toBe('TX');
      await expect(page.getByRole('heading', { name: 'Enter Initials', exact: true })).not.toBeVisible();
    });

    test('hides the initials input when the recipient has no initials field', async ({ page, request }) => {
      const { distributeResult } = await apiSeedPendingDocument(request, {
        recipients: [{ email: 'no-initials@test.documenso.com', name: 'Tom' }],
        fieldsPerRecipient: [
          [{ type: FieldType.SIGNATURE, page: 1, positionX: 10, positionY: 10, width: 25, height: 6 }],
        ],
      });
      await page.goto(`/sign/${distributeResult.recipients[0].token}`);
      await expect(page.locator('.konva-container canvas').first()).toBeVisible({ timeout: 30_000 });
      await settings(page, true);
      await expect(page.getByLabel('Full Name', { exact: true }).filter({ visible: true })).toBeVisible();
      await expect(page.getByLabel('Initials', { exact: true })).toHaveCount(0);
    });
  });
}
