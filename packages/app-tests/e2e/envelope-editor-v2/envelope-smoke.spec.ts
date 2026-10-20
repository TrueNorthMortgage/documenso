import fs from 'node:fs/promises';
import path from 'node:path';
import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';
import { prisma } from '@documenso/prisma';
import { seedUser } from '@documenso/prisma/seed/users';
import { expect, type Page, test } from '@playwright/test';
import { DocumentStatus, EnvelopeType, FieldType, SigningStatus } from '@prisma/client';

import { apiSignin } from '../fixtures/authentication';
import { clickAddMyselfButton, clickEnvelopeEditorStep, getRecipientEmailInputs } from '../fixtures/envelope-editor';
import { getKonvaElementCountForPage } from '../fixtures/konva';
import { readPdfQrCode } from '../fixtures/pdf-qr';
import { signSignaturePad } from '../fixtures/signature';

const examplePdf = path.join(__dirname, '../../../../assets/example.pdf');

const expectSuccessfulMutation = async (page: Page, procedure: string, action: () => Promise<void>) => {
  const [response] = await Promise.all([
    page.waitForResponse((response) => {
      const procedures = new URL(response.url()).pathname.split('/api/trpc/')[1]?.split(',') ?? [];
      return response.request().method() === 'POST' && procedures.includes(procedure);
    }),
    action(),
  ]);

  expect(response.status(), await response.text()).toBe(200);
};

// Only the account is seeded. Uploading, editing, sending, signing, and downloading
// go through the browser and the real application endpoints.
const uploadEnvelope = async (page: Page, type: EnvelopeType) => {
  const { user, team } = await seedUser({ isPersonalOrganisation: true });
  const section = type === EnvelopeType.DOCUMENT ? 'documents' : 'templates';
  await apiSignin({ page, email: user.email, redirectPath: `/t/${team.url}/${section}` });
  await expect(page).toHaveURL(`/t/${team.url}/${section}`);

  // File inputs contribute "Choose File" to the parent button's accessible name.
  // Match the visible upload label without depending on that browser-provided prefix.
  const uploadButton = page.getByRole('button', {
    name: type === EnvelopeType.DOCUMENT ? /Upload Document$/ : /Upload Template$/,
  });
  await expect(uploadButton).toBeVisible();
  await expect(uploadButton).toBeEnabled();
  await expectSuccessfulMutation(page, 'envelope.create', () =>
    uploadButton.getByTestId('document-upload-input').setInputFiles(examplePdf),
  );
  await expect(page).toHaveURL(new RegExp(`/${section}/envelope_[^/]+/edit`));

  const envelopeId = new URL(page.url()).pathname.split('/').at(-2);
  if (!envelopeId) {
    throw new Error('The uploaded envelope ID was not found in the editor URL');
  }

  await clickAddMyselfButton(page);
  await expect(getRecipientEmailInputs(page).first()).toHaveValue(user.email);
  await clickEnvelopeEditorStep(page, 'addFields');
  await expect(page.getByRole('heading', { name: 'Recipient', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Signature', exact: true }).click();
  await page
    .locator('.konva-container canvas')
    .first()
    .click({ position: { x: 120, y: 140 } });
  await expect.poll(() => getKonvaElementCountForPage(page, 1, '.field-group')).toBe(1);
  await clickEnvelopeEditorStep(page, 'upload');
  await expect.poll(() => prisma.field.count({ where: { envelopeId } })).toBe(1);

  return { user, team, envelopeId };
};

test.describe('core workflows', { tag: '@smoke' }, () => {
  test.setTimeout(120_000);

  test('document editor: upload, send, sign, download, and verify its QR code', async ({ page, browser }, testInfo) => {
    const { user, team, envelopeId } = await uploadEnvelope(page, EnvelopeType.DOCUMENT);

    await page.locator('button[title="Send Envelope"]').click();
    const sendDialog = page.getByRole('dialog');
    await expect(sendDialog.getByRole('heading', { name: 'Send Document' })).toBeVisible();
    await expectSuccessfulMutation(page, 'envelope.distribute', () =>
      sendDialog.getByRole('button', { name: 'Send', exact: true }).click(),
    );
    await expect
      .poll(async () => (await prisma.envelope.findUniqueOrThrow({ where: { id: envelopeId } })).status)
      .toBe(DocumentStatus.PENDING);

    const recipient = await prisma.recipient.findFirstOrThrow({
      where: { envelopeId, email: user.email },
      include: { fields: true },
    });
    expect(recipient.fields).toHaveLength(1);
    await page.goto(`/sign/${recipient.token}`);
    await expect(page.getByRole('heading', { name: 'Sign Document' })).toBeVisible();
    await signSignaturePad(page);

    const canvas = page.locator('.konva-container canvas').first();
    await expect(canvas).toBeVisible();
    const bounds = await canvas.boundingBox();
    if (!bounds) {
      throw new Error('The signing canvas was not found');
    }
    const field = recipient.fields[0];
    await canvas.click({
      position: {
        x: ((Number(field.positionX) + Number(field.width) / 2) / 100) * bounds.width,
        y: ((Number(field.positionY) + Number(field.height) / 2) / 100) * bounds.height,
      },
    });
    await expect(page.getByText('0 Fields Remaining').first()).toBeVisible();
    await page.getByRole('button', { name: 'Complete', exact: true }).click();
    await page.getByRole('button', { name: 'Sign', exact: true }).click();
    await expect(page).toHaveURL(`/sign/${recipient.token}/complete`);
    await expect
      .poll(async () => (await prisma.envelope.findUniqueOrThrow({ where: { id: envelopeId } })).status, {
        timeout: 60_000,
      })
      .toBe(DocumentStatus.COMPLETED);

    const completed = await prisma.envelope.findUniqueOrThrow({ where: { id: envelopeId } });
    expect(completed.qrToken).toMatch(/^qr_/);
    expect((await prisma.recipient.findUniqueOrThrow({ where: { id: recipient.id } })).signingStatus).toBe(
      SigningStatus.SIGNED,
    );
    const signedField = await prisma.field.findUniqueOrThrow({ where: { id: field.id }, include: { signature: true } });
    expect(signedField.inserted).toBe(true);
    expect(signedField.signature?.typedSignature).toBe('Signature');
    await page.goto(`/t/${team.url}/documents`);
    const row = page.getByRole('row').filter({ hasText: completed.title });
    await row.getByRole('button', { name: 'Download', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('dialog').getByRole('button', { name: 'Signed', exact: true }).click();
    const download = await downloadPromise;
    const pdfPath = testInfo.outputPath('signed-envelope.pdf');
    await download.saveAs(pdfPath);
    expect(await download.failure()).toBeNull();
    await testInfo.attach('signed-envelope', { path: pdfPath, contentType: 'application/pdf' });

    const qrUrl = await readPdfQrCode(new Uint8Array(await fs.readFile(pdfPath)));
    expect(qrUrl).toBe(`${NEXT_PUBLIC_WEBAPP_URL()}/share/${completed.qrToken}`);
    const verificationPage = await browser.newPage();
    try {
      const response = await verificationPage.goto(qrUrl);
      expect(response?.status()).toBe(200);
      await expect(verificationPage).toHaveURL(qrUrl);
      await expect(verificationPage.getByRole('heading', { name: completed.title, exact: true })).toBeVisible();
    } finally {
      await verificationPage.close();
    }
  });

  test('template editor: upload, configure, and create an envelope from a template', async ({ page }) => {
    const { envelopeId: templateId } = await uploadEnvelope(page, EnvelopeType.TEMPLATE);
    const template = await prisma.envelope.findUniqueOrThrow({
      where: { id: templateId },
      include: { recipients: true, fields: true, envelopeItems: true },
    });
    expect(template.fields[0].type).toBe(FieldType.SIGNATURE);

    await page.getByRole('button', { name: 'Use Template', exact: true }).first().click();
    await expectSuccessfulMutation(page, 'template.createDocumentFromTemplate', () =>
      page.getByRole('dialog').getByRole('button', { name: 'Create as draft', exact: true }).click(),
    );
    await expect(page).toHaveURL(/\/documents\/envelope_[^/?]+/);
    const envelopeId = new URL(page.url()).pathname.match(/\/documents\/(envelope_[^/]+)/)?.[1];
    if (!envelopeId) {
      throw new Error('The envelope created from the template was not found');
    }

    const document = await prisma.envelope.findUniqueOrThrow({
      where: { id: envelopeId },
      include: { recipients: true, fields: true, envelopeItems: true },
    });
    expect(document.id).not.toBe(template.id);
    expect(document).toMatchObject({
      type: EnvelopeType.DOCUMENT,
      status: DocumentStatus.DRAFT,
      title: template.title,
    });
    expect(document.envelopeItems).toHaveLength(1);
    expect(document.envelopeItems[0].title).toBe(template.envelopeItems[0].title);
    expect(document.envelopeItems[0].documentDataId).toBeTruthy();
    expect(document.recipients).toHaveLength(1);
    expect(document.recipients[0]).toMatchObject({
      email: template.recipients[0].email,
      name: template.recipients[0].name,
      role: template.recipients[0].role,
    });
    expect(document.fields).toHaveLength(1);
    expect(document.fields[0]).toMatchObject({
      type: FieldType.SIGNATURE,
      page: template.fields[0].page,
      recipientId: document.recipients[0].id,
      envelopeItemId: document.envelopeItems[0].id,
    });
    expect(document.fields[0].positionX.toString()).toBe(template.fields[0].positionX.toString());
    expect(document.fields[0].positionY.toString()).toBe(template.fields[0].positionY.toString());
    expect(document.fields[0].width.toString()).toBe(template.fields[0].width.toString());
    expect(document.fields[0].height.toString()).toBe(template.fields[0].height.toString());
    expect(document.fields[0].inserted).toBe(false);
    expect((await prisma.envelope.findUniqueOrThrow({ where: { id: templateId } })).type).toBe(EnvelopeType.TEMPLATE);
  });
});
