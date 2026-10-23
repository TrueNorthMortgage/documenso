import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '@documenso/prisma';
import { DocumentStatus } from '@documenso/prisma/client';
import { PDF, PdfDict, PdfString } from '@libpdf/core';
import { expect, test } from '@playwright/test';

import {
  clickAddMyselfButton,
  getEnvelopeItemDropzoneInput,
  getEnvelopeItemTitleInputs,
  getRecipientEmailInputs,
  openDocumentEnvelopeEditor,
  openEmbeddedEnvelopeEditor,
  openTemplateEnvelopeEditor,
  setRecipientEmail,
  setRecipientName,
} from '../fixtures/envelope-editor';

const placeholderPdf = path.join(
  __dirname,
  '../../../assets/fixtures/auto-placement/project-proposal-multiple-fields-and-recipients.pdf',
);

const snapshot = (envelopeId: string | undefined) => {
  if (!envelopeId) {
    throw new Error('Expected a persisted envelope');
  }
  return prisma.envelope.findUniqueOrThrow({
    where: { id: envelopeId },
    include: {
      recipients: { orderBy: { id: 'asc' } },
      fields: { orderBy: { id: 'asc' } },
      envelopeItems: { orderBy: { id: 'asc' } },
    },
  });
};

test('uploading placeholders into an existing draft creates missing recipients once and warns', async ({ page }) => {
  const surface = await openDocumentEnvelopeEditor(page);
  await clickAddMyselfButton(page);
  await expect(getRecipientEmailInputs(page).first()).toHaveValue(surface.userEmail);
  await expect.poll(() => prisma.recipient.count({ where: { envelopeId: surface.envelopeId } })).toBe(1);
  await getEnvelopeItemDropzoneInput(page).setInputFiles(placeholderPdf);
  await expect(page.getByText('Recipients added from document placeholders', { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Notifications (F8)' })
      .getByText(/Review their names, email addresses, and roles before sending/),
  ).toBeVisible();
  await expect.poll(() => prisma.recipient.count({ where: { envelopeId: surface.envelopeId } })).toBe(3);
  const recipients = await prisma.recipient.findMany({
    where: { envelopeId: surface.envelopeId },
    orderBy: { id: 'asc' },
    select: { id: true, email: true, name: true, role: true, token: true },
  });
  expect(recipients[0].email).toBe(surface.userEmail);
  await getEnvelopeItemDropzoneInput(page).setInputFiles({
    name: 'Second placeholder document.pdf',
    mimeType: 'application/pdf',
    buffer: fs.readFileSync(placeholderPdf),
  });
  await expect.poll(() => prisma.envelopeItem.count({ where: { envelopeId: surface.envelopeId } })).toBe(3);
  expect(
    await prisma.recipient.findMany({
      where: { envelopeId: surface.envelopeId },
      orderBy: { id: 'asc' },
      select: { id: true, email: true, name: true, role: true, token: true },
    }),
  ).toEqual(recipients);
});

test('correction blocks recipient controls and rejects placeholder uploads needing new recipients atomically', async ({
  page,
}) => {
  const surface = await openDocumentEnvelopeEditor(page);
  await clickAddMyselfButton(page);
  await expect.poll(() => prisma.recipient.count({ where: { envelopeId: surface.envelopeId } })).toBe(1);
  await prisma.envelope.update({
    where: { id: surface.envelopeId },
    data: { status: DocumentStatus.PENDING, correctionStartedAt: new Date() },
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Add Signer', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Add Myself', exact: true })).toBeDisabled();
  const before = await snapshot(surface.envelopeId);
  await getEnvelopeItemDropzoneInput(page).setInputFiles(placeholderPdf);
  await expect(page.getByText('Upload failed', { exact: true })).toBeVisible();
  expect(await snapshot(surface.envelopeId)).toEqual(before);
  // The single-recipient fixture references only r1, so it remains allowed.
  await getEnvelopeItemDropzoneInput(page).setInputFiles(
    path.join(__dirname, '../../../assets/fixtures/auto-placement/project-proposal-single-recipient.pdf'),
  );
  await expect.poll(() => prisma.envelopeItem.count({ where: { envelopeId: surface.envelopeId } })).toBe(2);
  expect(await prisma.recipient.count({ where: { envelopeId: surface.envelopeId } })).toBe(1);
});

for (const surfaceName of ['document editor', 'template editor', 'embedded create', 'embedded edit']) {
  test.describe(surfaceName, () => {
    for (const kind of ['protected', 'XFA']) {
      test(`${kind} PDF is rejected without persisting invalid files`, async ({ page }) => {
        const surface =
          surfaceName === 'document editor'
            ? await openDocumentEnvelopeEditor(page)
            : surfaceName === 'template editor'
              ? await openTemplateEnvelopeEditor(page)
              : await openEmbeddedEnvelopeEditor(page, {
                  envelopeType: 'DOCUMENT',
                  mode: surfaceName === 'embedded create' ? 'create' : 'edit',
                });
        if (!surface.isEmbedded) {
          await clickAddMyselfButton(page);
          await expect
            .poll(() => prisma.recipient.count({ where: { envelopeId: surface.envelopeId, email: surface.userEmail } }))
            .toBe(1);
        } else {
          await setRecipientEmail(page, 0, surface.userEmail);
          await setRecipientName(page, 0, surface.userName);
        }
        const pdf = PDF.create();
        pdf.addPage({ width: 612, height: 792 });
        if (kind === 'protected') {
          pdf.setProtection({ userPassword: '', ownerPassword: 'e2e-only', permissions: { copy: false, print: true } });
        } else {
          pdf.getCatalog().set('AcroForm', PdfDict.of({ XFA: PdfString.fromString('<xfa:datasets/>') }));
        }
        const before = surface.envelopeId ? await snapshot(surface.envelopeId) : null;
        const countBefore = await prisma.envelope.count({ where: { userId: surface.userId } });
        await getEnvelopeItemDropzoneInput(page).setInputFiles({
          name: `${kind}.pdf`,
          mimeType: 'application/pdf',
          buffer: Buffer.from(await pdf.save()),
        });
        if (surface.isEmbedded) {
          await expect(getEnvelopeItemTitleInputs(page).last()).toHaveValue(`${kind}.pdf`);
          const label = surfaceName === 'embedded create' ? 'Create Document' : 'Update Document';
          const responsePromise = page.waitForResponse(
            (response) =>
              response.url().includes('/api/trpc/embeddingPresign.') && response.request().method() === 'POST',
          );
          await page.getByRole('button', { name: label, exact: true }).click();
          const response = await responsePromise;
          expect(response.status()).toBe(400);
          expect(await response.text()).toContain(kind === 'protected' ? 'ENCRYPTED_PDF' : 'UNSUPPORTED_XFA_PDF');
          await expect(
            page
              .getByRole('region', { name: 'Notifications (F8)' })
              .getByText(
                surfaceName === 'embedded create'
                  ? 'Failed to create document. Please try again.'
                  : 'Failed to update envelope. Please try again.',
                { exact: true },
              ),
          ).toBeVisible();
        } else {
          await expect(
            page
              .getByRole('region', { name: 'Notifications (F8)' })
              .getByText(
                kind === 'protected' ? /This PDF is protected and cannot be uploaded/ : /This PDF uses an XFA form/,
              ),
          ).toBeVisible();
          await expect(
            page.getByRole('region', { name: 'Notifications (F8)' }).getByText(/print.*to a new PDF/i),
          ).toBeVisible();
        }
        if (surface.envelopeId) {
          expect(await snapshot(surface.envelopeId)).toEqual(before);
        }
        expect(await prisma.envelope.count({ where: { userId: surface.userId } })).toBe(countBefore);
      });
    }
  });
}
