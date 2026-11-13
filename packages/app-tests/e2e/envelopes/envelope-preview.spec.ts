import { DOCUMENT_AUDIT_LOG_TYPE } from '@documenso/lib/types/document-audit-logs';
import { DocumentAuth } from '@documenso/lib/types/document-auth';
import { prefixedId } from '@documenso/lib/universal/id';
import { prisma } from '@documenso/prisma';
import { seedBlankDocument } from '@documenso/prisma/seed/documents';
import { seedUser } from '@documenso/prisma/seed/users';
import { expect, test } from '@playwright/test';
import { DocumentStatus, EmailDeliveryStatus, Prisma, RecipientRole } from '@prisma/client';

import { apiSignin } from '../fixtures/authentication';
import { expectToastTextToBeVisible } from '../fixtures/generic';

test('keeps one live preview link for an envelope through drafting and correction', async ({
  page,
  browser,
  request,
}) => {
  const { user, team } = await seedUser();
  const draft = await seedBlankDocument(user, team.id, { internalVersion: 2, key: 'Preview sharing' });
  const prefix = user.email.split('@')[0];
  const firstEmail = `${prefix}-first@example.com`;
  const secondEmail = `${prefix}-second@example.com`;
  const additionalEmail = `${prefix}-additional@example.com`;
  const secondDocumentTitle = 'Supplemental mortgage terms';

  const firstItem = await prisma.envelopeItem.findFirstOrThrow({
    where: { envelopeId: draft.id },
    include: { documentData: true },
  });
  const supplementalItem = await prisma.envelopeItem.create({
    data: {
      id: prefixedId('envelope_item'),
      title: secondDocumentTitle,
      order: firstItem.order + 1,
      envelope: { connect: { id: draft.id } },
      documentData: {
        create: {
          type: firstItem.documentData.type,
          data: firstItem.documentData.data,
          initialData: firstItem.documentData.initialData,
        },
      },
    },
  });

  const signer = await prisma.recipient.create({
    data: { envelopeId: draft.id, email: firstEmail, name: 'Alex Morgan', role: RecipientRole.SIGNER, token: draft.id },
  });
  await prisma.recipient.create({
    data: {
      envelopeId: draft.id,
      email: secondEmail,
      name: 'Jamie Morgan',
      role: RecipientRole.SIGNER,
      token: prefixedId('recipient'),
    },
  });

  await apiSignin({ page, email: user.email, redirectPath: `/t/${team.url}/documents` });
  await page.getByRole('row').filter({ hasText: draft.title }).getByTestId('document-table-action-btn').click();
  await page.getByRole('menuitem', { name: 'Send preview link' }).click();

  const dialog = page.getByRole('dialog', { name: 'Send preview link' });
  const emailInputs = dialog.getByRole('textbox', { name: 'Recipient email', exact: true });
  await expect(emailInputs).toHaveCount(2);
  expect(
    (await emailInputs.evaluateAll((inputs: HTMLInputElement[]) => inputs.map((input) => input.value))).sort(),
  ).toEqual([firstEmail, secondEmail].sort());
  await dialog.getByLabel('Message (Optional)').fill('Please review the terms.');
  await dialog.getByRole('button', { name: 'Send preview link', exact: true }).click();
  await expect(dialog.getByRole('status')).toHaveText('Preview link sent.');
  await expectToastTextToBeVisible(page, 'Preview link sent.');
  const previewUrl = await dialog.getByRole('textbox', { name: 'Preview link', exact: true }).inputValue();
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await dialog.getByRole('button', { name: 'Copy link' }).click();
  await expect(dialog.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(previewUrl);
  await expect(prisma.envelope.findUnique({ where: { id: draft.id } })).resolves.toMatchObject({
    status: DocumentStatus.DRAFT,
  });
  await expect(prisma.recipient.count({ where: { envelopeId: draft.id } })).resolves.toBe(2);

  const mailboxUrl = process.env.DOCUMENSO_TEST_INBUCKET_URL || 'http://inbucket:9000';
  const getPreviewPath = async (email: string, previousPath?: string) => {
    const mailbox = `${mailboxUrl}/api/v1/mailbox/${email.split('@')[0]}`;
    let path: string | undefined;

    await expect
      .poll(async () => {
        const messages = await request.get(mailbox);
        for (const message of (await messages.json()) as Array<{ id: string }>) {
          const detail = await request.get(`${mailbox}/${message.id}`);
          const content = (await detail.json()) as { body: { html: string } };
          const candidate = content.body.html.match(/\/preview\/[a-f0-9]{64}\?email=[a-f0-9-]{36}/)?.[0];

          if (candidate && candidate !== previousPath && content.body.html.includes('Please review the terms.')) {
            path = candidate;
            return true;
          }
        }

        return false;
      })
      .toBe(true);

    if (!path) {
      throw new Error('Expected a preview link in the email.');
    }

    return path;
  };

  const firstPath = await getPreviewPath(firstEmail);
  const secondPath = await getPreviewPath(secondEmail);
  const basePath = new URL(previewUrl).pathname;
  expect(firstPath).not.toBe(secondPath);
  expect(firstPath.split('?')[0]).toBe(basePath);
  expect(secondPath.split('?')[0]).toBe(basePath);
  const recipient = await browser.newPage({ baseURL: page.url() });

  try {
    await recipient.goto(firstPath);
    await expect(recipient.getByRole('heading', { name: draft.title })).toBeVisible();
    const image = recipient.locator('figure img').first();
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
    const supplementalPage = recipient.getByRole('img', { name: `${secondDocumentTitle} — 1`, exact: true });
    await supplementalPage.scrollIntoViewIfNeeded();
    await expect
      .poll(() => supplementalPage.evaluate((node: HTMLImageElement) => node.naturalWidth))
      .toBeGreaterThan(0);
    await expect(recipient.locator('figcaption').first()).toContainText(firstItem.title);
    await expect(recipient.locator('figcaption').last()).toContainText(secondDocumentTitle);

    await recipient.emulateMedia({ media: 'print' });
    await expect(recipient.getByText('Printing is disabled for this preview.')).toBeVisible();
    await expect(image).toBeHidden();
    await expect(supplementalPage).toBeHidden();
    await recipient.emulateMedia({ media: 'screen' });
    const imagePath = await image.getAttribute('src');

    if (!imagePath) {
      throw new Error('Expected a rendered preview page.');
    }

    const imageResponse = await recipient.request.get(imagePath);
    expect(imageResponse.headers()['content-type']).toBe('image/jpeg');
    expect(imageResponse.headers()['cache-control']).toContain('no-store');
    expect((await recipient.request.get(imagePath, { headers: { 'Sec-Fetch-Dest': 'document' } })).status()).toBe(404);
    await expect(image).toHaveAttribute('draggable', 'false');
    await expect
      .poll(() =>
        image.evaluate((node) => {
          const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
          return !node.dispatchEvent(menu);
        }),
      )
      .toBe(true);

    const previewToken = basePath.split('/').pop();
    const pdfResponse = await recipient.request.get(
      `/api/files/token/${previewToken}/envelope/${draft.id}/envelopeItem/${firstItem.id}/dataId/${firstItem.documentDataId}/initial/item.pdf`,
    );
    expect(pdfResponse.status()).toBe(404);

    await dialog.getByRole('button', { name: 'Close', exact: true }).click();
    await page.goto(`/t/${team.url}/documents/${draft.id}/edit?step=addFields`);
    await page.getByRole('button', { name: 'Send preview link', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText('Already shared');
    await expect(dialog.getByRole('textbox', { name: 'Preview link', exact: true })).toHaveValue(previewUrl);
    await expect(emailInputs).toHaveCount(1);
    await expect(emailInputs).toHaveValue('');
    await prisma.recipient.update({
      where: { id: signer.id },
      data: { authOptions: { accessAuth: [DocumentAuth.ACCOUNT], actionAuth: [] } },
    });
    await recipient.reload();
    await expect(recipient.getByRole('heading', { name: 'This preview is unavailable' })).toBeVisible();
    expect((await recipient.request.get(imagePath)).status()).toBe(404);
    await emailInputs.fill(additionalEmail);
    await dialog.getByLabel('Message (Optional)').fill('Please review the terms.');
    await dialog.getByRole('button', { name: 'Send preview link', exact: true }).click();
    await expect(dialog).toContainText('Preview links are unavailable when recipient access verification is required.');
    await prisma.recipient.update({ where: { id: signer.id }, data: { authOptions: Prisma.DbNull } });
    await dialog.getByRole('button', { name: 'Send preview link', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText('Preview link sent.');
    const additionalPath = await getPreviewPath(additionalEmail);
    expect(additionalPath.split('?')[0]).toBe(basePath);
    await recipient.goto(additionalPath);
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
    await expect(prisma.recipient.count({ where: { envelopeId: draft.id, email: additionalEmail } })).resolves.toBe(0);

    await prisma.envelope.update({ where: { id: draft.id }, data: { title: 'Updated draft' } });
    await prisma.envelopeItem.update({
      where: { id: supplementalItem.id },
      data: { title: 'Updated supplemental terms' },
    });
    await recipient.goto(secondPath);
    await expect(recipient.getByRole('heading', { name: 'Updated draft' })).toBeVisible();
    await expect(recipient.locator('figcaption').last()).toContainText('Updated supplemental terms');
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
    expect((await recipient.request.get(imagePath)).status()).toBe(404);
    const updatedImagePath = await image.getAttribute('src');

    if (!updatedImagePath) {
      throw new Error('Expected a rendered updated preview page.');
    }

    await prisma.envelope.update({ where: { id: draft.id }, data: { status: DocumentStatus.PENDING } });
    await recipient.reload();
    await expect(recipient.getByRole('heading', { name: 'This preview is unavailable' })).toBeVisible();
    expect((await recipient.request.get(updatedImagePath)).status()).toBe(404);

    await prisma.envelope.update({ where: { id: draft.id }, data: { correctionStartedAt: new Date() } });
    await recipient.reload();
    await expect(recipient.getByRole('heading', { name: 'This preview is unavailable' })).toBeVisible();
    expect((await recipient.request.get(updatedImagePath)).status()).toBe(404);

    await page.goto(`/t/${team.url}/documents/${draft.id}`);
    await page.getByTestId('document-page-view-action-btn').click();
    await page.getByRole('menuitem', { name: 'Send preview link' }).click();
    await expect(dialog).toContainText('the preview has no download option');
    await dialog.getByRole('button', { name: 'Close', exact: true }).click();

    await page.goto(`/t/${team.url}/documents/${draft.id}/edit?step=addFields`);
    await page.getByRole('button', { name: 'Send preview link', exact: true }).click();
    await expect(dialog.getByText('Preview link inactive')).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Preview link', exact: true })).toHaveValue(previewUrl);
    await emailInputs.fill(firstEmail);
    await dialog.getByLabel('Message (Optional)').fill('Please review the terms.');
    await dialog.getByRole('button', { name: 'Send preview link', exact: true }).click();
    await expect(dialog.getByRole('status')).toHaveText('Preview link sent.');

    const correctionPath = await getPreviewPath(firstEmail, firstPath);
    expect(correctionPath.split('?')[0]).toBe(basePath);
    await recipient.goto(correctionPath);
    await expect(recipient.getByRole('heading', { name: 'Updated draft' })).toBeVisible();
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
    const correctionImagePath = await image.getAttribute('src');

    if (!correctionImagePath) {
      throw new Error('Expected a rendered correction preview page.');
    }

    await recipient.goto(basePath);
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
    await recipient.goto(correctionPath);

    await prisma.envelope.update({ where: { id: draft.id }, data: { correctionStartedAt: null } });
    await recipient.reload();
    await expect(recipient.getByRole('heading', { name: 'This preview is unavailable' })).toBeVisible();
    expect((await recipient.request.get(correctionImagePath)).status()).toBe(404);

    await prisma.envelope.update({ where: { id: draft.id }, data: { correctionStartedAt: new Date() } });
    await recipient.reload();
    await expect(recipient.getByRole('heading', { name: 'This preview is unavailable' })).toBeVisible();
    expect((await recipient.request.get(correctionImagePath)).status()).toBe(404);

    const logs = await prisma.documentAuditLog.findMany({ where: { envelopeId: draft.id } });
    expect(logs.filter((log) => log.type === DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_PREVIEW_SENT)).toHaveLength(4);
    const opens = logs.filter((log) => log.type === DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_PREVIEW_OPENED);
    expect(opens).toHaveLength(5);
    expect(opens.map((log) => log.data)).toEqual(
      expect.arrayContaining([
        {},
        { recipientEmail: firstEmail, attemptId: firstPath.split('=')[1] },
        { recipientEmail: secondEmail, attemptId: secondPath.split('=')[1] },
        { recipientEmail: additionalEmail, attemptId: additionalPath.split('=')[1] },
        { recipientEmail: firstEmail, attemptId: correctionPath.split('=')[1] },
      ]),
    );
    await expect(prisma.envelopePreview.count({ where: { envelopeId: draft.id } })).resolves.toBe(1);

    await prisma.documentAuditLog.create({
      data: {
        envelopeId: draft.id,
        type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_PREVIEW_EMAIL_DELIVERY_UPDATED,
        createdAt: draft.createdAt,
        data: {
          attemptId: additionalPath.split('=')[1],
          recipientEmail: additionalEmail,
          status: EmailDeliveryStatus.BOUNCED,
          occurredAt: new Date().toISOString(),
          failureCode: 'HardBounce',
        },
      },
    });
    await dialog.getByRole('link', { name: 'Recent Activity', exact: true }).click();
    await expect(page).toHaveURL(`/t/${team.url}/documents/${draft.id}#recent-activity`);
    const activity = page.locator('#recent-activity');
    await expect(activity.getByText(`You sent a preview link to ${firstEmail}`, { exact: true })).toHaveCount(2);
    await expect(
      activity.getByText(`Preview link opened from email sent to ${firstEmail}`, { exact: true }),
    ).toHaveCount(2);
    await expect(activity.getByText('Preview link opened directly', { exact: true })).toBeVisible();
    const bounceRow = activity
      .getByRole('listitem')
      .filter({ hasText: `Preview email bounced for ${additionalEmail}` });
    await expect(bounceRow.getByTestId('preview-email-delivery-warning')).toBeVisible();
  } finally {
    await recipient.close();
  }
});
