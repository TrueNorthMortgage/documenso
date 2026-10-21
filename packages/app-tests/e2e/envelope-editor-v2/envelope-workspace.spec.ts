import { seedUser } from '@documenso/prisma/seed/users';
import { expect, test } from '@playwright/test';

import { apiSignin } from '../fixtures/authentication';
import {
  addEnvelopeItemPdf,
  clickAddSignerButton,
  clickEnvelopeEditorStep,
  getEnvelopeItemDropzoneInput,
  getEnvelopeItemTitleInputs,
  getRecipientEmailInputs,
  openDocumentEnvelopeEditor,
  openEmbeddedEnvelopeEditor,
  openTemplateEnvelopeEditor,
  setRecipientEmail,
  setRecipientName,
  type TEnvelopeEditorSurface,
} from '../fixtures/envelope-editor';

const assertWorkspace = async (surface: TEnvelopeEditorSurface) => {
  const isTemplate = surface.envelopeType === 'TEMPLATE';
  const { root } = surface;

  await expect(root.getByTestId('envelope-editor-mode')).toHaveText(
    isTemplate ? 'Editing template' : 'Editing document',
  );
  await expect(getEnvelopeItemDropzoneInput(root)).toBeAttached();

  if (surface.isEmbedded && !surface.envelopeId) {
    await addEnvelopeItemPdf(root, 'workspace.pdf');
  }

  await expect(getEnvelopeItemTitleInputs(root).first()).toBeVisible();
  const applyTemplate = root.getByRole('button', { name: 'Apply Template', exact: true });
  const addViaTemplate = root.getByRole('button', { name: 'Add a document via Template', exact: true });

  if (isTemplate) {
    await expect(applyTemplate).toHaveCount(0);
    await expect(addViaTemplate).toHaveCount(0);
  } else {
    await expect(applyTemplate.first()).toBeVisible();
    await expect(addViaTemplate).toBeVisible();
  }

  if ((await getRecipientEmailInputs(root).count()) === 0) {
    await clickAddSignerButton(root);
  }
  await setRecipientName(root, 0, 'Workspace recipient');
  await setRecipientEmail(root, 0, 'workspace@example.com');
  await clickEnvelopeEditorStep(root, 'addFields');
  await expect(root.getByRole('heading', { name: 'Recipient', exact: true })).toBeVisible();
  await expect(root.getByTestId('envelope-editor-mode')).toHaveText(
    isTemplate ? 'Editing template' : 'Editing document',
  );
  if (isTemplate) {
    await expect(applyTemplate).toHaveCount(0);
  } else {
    await expect(applyTemplate).toBeVisible();
  }
};

test.describe('document editor', () => {
  test('identifies document editing and retains template actions', async ({ page }) => {
    await assertWorkspace(await openDocumentEnvelopeEditor(page));
  });
});

test.describe('template editor', () => {
  test('identifies template editing and hides document-only actions', async ({ page }) => {
    await assertWorkspace(await openTemplateEnvelopeEditor(page));
  });
});

for (const mode of ['create', 'edit'] as const) {
  test.describe(`embedded ${mode}`, () => {
    for (const envelopeType of ['DOCUMENT', 'TEMPLATE'] as const) {
      test(`${envelopeType}: identifies the workspace and shows only valid actions`, async ({ page }) => {
        await assertWorkspace(await openEmbeddedEnvelopeEditor(page, { envelopeType, mode }));
      });
    }
  });
}

for (const isTemplate of [false, true]) {
  test(`${isTemplate ? 'templates' : 'documents'} list identifies its upload workflow`, async ({ page }) => {
    const { user, team } = await seedUser();
    await apiSignin({
      page,
      email: user.email,
      redirectPath: `/t/${team.url}/${isTemplate ? 'templates' : 'documents'}`,
    });

    await expect(
      page.getByRole('heading', { name: isTemplate ? 'Templates' : 'Documents', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        isTemplate ? 'Create reusable layouts for future documents.' : 'Prepare and send documents for signing.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: isTemplate ? /Create Template$/ : /Upload Document$/ }),
    ).toBeVisible();

    const dataTransfer = await page.evaluateHandle(() => {
      const data = new DataTransfer();
      data.items.add(new File(['test'], 'workspace.pdf', { type: 'application/pdf' }));
      return data;
    });
    await page.getByTestId('envelope-upload-area').dispatchEvent('dragenter', { dataTransfer });
    await expect(
      page.getByRole('heading', { name: isTemplate ? 'Create Template' : 'Upload Document', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        isTemplate
          ? 'Drop files here to create a reusable template.'
          : 'Drop files here to create a document for signing.',
        { exact: true },
      ),
    ).toBeVisible();
    await page.getByTestId('envelope-upload-area').dispatchEvent('dragleave', { dataTransfer });
    await dataTransfer.dispose();
  });
}
