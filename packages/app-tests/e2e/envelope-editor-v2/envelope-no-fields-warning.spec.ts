import { prisma } from '@documenso/prisma';
import { DocumentStatus, RecipientRole } from '@documenso/prisma/client';
import { expect, test } from '@playwright/test';

import {
  addEnvelopeItemPdf,
  clickAddMyselfButton,
  openDocumentEnvelopeEditor,
  setRecipientRole,
} from '../fixtures/envelope-editor';

for (const count of [1, 2]) {
  test(`sending ${count} documents without fields warns but does not block`, async ({ page }) => {
    const surface = await openDocumentEnvelopeEditor(page);
    await clickAddMyselfButton(page, { waitForSave: true });
    await setRecipientRole(page, 0, 'Needs to view');
    if (count === 2) {
      await addEnvelopeItemPdf(page, 'Second empty document.pdf');
      await expect.poll(() => prisma.envelopeItem.count({ where: { envelopeId: surface.envelopeId } })).toBe(2);
    }
    await expect
      .poll(() => prisma.recipient.findFirst({ where: { envelopeId: surface.envelopeId }, select: { role: true } }))
      .toEqual({ role: RecipientRole.VIEWER });
    await page.locator('button[title="Send Envelope"]').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Send without fields?', { exact: true })).toBeVisible();
    await expect(
      dialog.getByText(
        count === 1
          ? 'No fields have been added to this document.'
          : 'No fields have been added to the documents listed below.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
    await dialog.getByRole('button', { name: 'Send', exact: true }).click();
    await expect
      .poll(async () => (await prisma.envelope.findUniqueOrThrow({ where: { id: surface.envelopeId } })).status)
      .toBe(DocumentStatus.PENDING);
  });
}

test('warns when only one document lacks fields and clears after that document is removed', async ({ page }) => {
  const surface = await openDocumentEnvelopeEditor(page);
  await clickAddMyselfButton(page, { waitForSave: true });
  await page.getByTestId('envelope-editor-step-addFields').first().click();
  await page.getByRole('button', { name: 'Signature', exact: true }).click();
  const canvas = page.locator('.konva-container canvas').first();
  await expect(canvas).toBeVisible();
  const [response] = await Promise.all([
    page.waitForResponse(
      (response) => response.url().includes('/api/trpc/envelope.field.set') && response.request().method() === 'POST',
    ),
    canvas.click({ position: { x: 120, y: 140 } }),
  ]);
  expect(response.ok()).toBe(true);
  await expect.poll(() => prisma.field.count({ where: { envelopeId: surface.envelopeId } })).toBe(1);
  await page.getByTestId('envelope-editor-step-upload').first().click();
  await addEnvelopeItemPdf(page, 'Empty attachment.pdf');
  await expect.poll(() => prisma.envelopeItem.count({ where: { envelopeId: surface.envelopeId } })).toBe(2);
  await page.locator('button[title="Send Envelope"]').click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Send without fields?', { exact: true })).toBeVisible();
  await expect(dialog.getByText('No fields have been added to this document.', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.locator('[data-testid^="envelope-item-remove-button-"]').last().click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect.poll(() => prisma.envelopeItem.count({ where: { envelopeId: surface.envelopeId } })).toBe(1);
  await page.locator('button[title="Send Envelope"]').click();
  await expect(page.getByRole('dialog').getByText('Send without fields?', { exact: true })).not.toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
});
