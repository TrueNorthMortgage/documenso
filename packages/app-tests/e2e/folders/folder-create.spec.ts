import { prisma } from '@documenso/prisma';
import { FolderType } from '@documenso/prisma/client';
import { seedBlankFolder } from '@documenso/prisma/seed/folders';
import { seedUser } from '@documenso/prisma/seed/users';
import { expect, test } from '@playwright/test';

import { apiSignin } from '../fixtures/authentication';

for (const type of [FolderType.DOCUMENT, FolderType.TEMPLATE]) {
  for (const isFolderPage of [false, true]) {
    test(`${type}: create folder from ${isFolderPage ? 'folder list' : 'dashboard'} breadcrumbs`, async ({ page }) => {
      const { user, team } = await seedUser();
      const root = await seedBlankFolder(user, team.id, {
        createFolderOptions: { name: 'Parent folder', type },
      });
      const child = await seedBlankFolder(user, team.id, {
        createFolderOptions: { name: 'Current folder', type, parentId: root.id },
      });
      const rootPath = `/t/${team.url}/${type === FolderType.DOCUMENT ? 'documents' : 'templates'}`;
      const folderPath = (parentId: string | null) =>
        isFolderPage
          ? `${rootPath}/folders${parentId ? `?parentId=${parentId}` : ''}`
          : parentId
            ? `${rootPath}/f/${parentId}`
            : rootPath;

      await apiSignin({ page, email: user.email, redirectPath: folderPath(child.id) });
      await page.getByTestId('folder-create-button').click();
      const dialog = page.getByRole('dialog');
      const nameInput = dialog.getByRole('textbox', { name: 'Folder Name', exact: true });
      await expect(dialog.getByRole('heading', { name: 'Create subfolder', exact: true })).toBeVisible();
      const breadcrumbs = dialog.getByRole('list', { name: 'Folder location', exact: true });
      await expect(breadcrumbs.getByText('Current folder', { exact: true })).toBeVisible();
      await expect(breadcrumbs.getByRole('button', { name: 'Current folder', exact: true })).toHaveCount(0);

      await nameInput.fill('Created in parent');
      await breadcrumbs.getByRole('button', { name: 'Parent folder', exact: true }).click();
      await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe(folderPath(root.id));
      await expect(dialog).toBeVisible();
      await expect(nameInput).toHaveValue('Created in parent');
      await expect(breadcrumbs.getByRole('button', { name: 'Parent folder', exact: true })).toHaveCount(0);
      await dialog.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(dialog).not.toBeVisible();
      await expect
        .poll(() =>
          prisma.folder.findFirst({
            where: { teamId: team.id, userId: user.id, name: 'Created in parent', type },
            select: { parentId: true },
          }),
        )
        .toEqual({ parentId: root.id });
      await expect(page.locator('a[data-folder-name="Created in parent"]')).toBeVisible();

      await page.getByTestId('folder-create-button').click();
      await expect(nameInput).toHaveValue('');
      await nameInput.fill('Created in home');
      await breadcrumbs.getByRole('button', { name: 'Home', exact: true }).click();
      await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe(folderPath(null));
      await expect(nameInput).toHaveValue('Created in home');
      await expect(dialog.getByRole('heading', { name: 'Create New Folder', exact: true })).toBeVisible();
      await expect(breadcrumbs.getByRole('button', { name: 'Home', exact: true })).toHaveCount(0);
      await dialog.getByRole('button', { name: 'Create', exact: true }).click();
      await expect(dialog).not.toBeVisible();
      await expect
        .poll(() =>
          prisma.folder.findFirst({
            where: { teamId: team.id, userId: user.id, name: 'Created in home', type },
            select: { parentId: true },
          }),
        )
        .toEqual({ parentId: null });
      await expect(page.locator('a[data-folder-name="Created in home"]')).toBeVisible();
      await page.reload();
      await expect(dialog).not.toBeVisible();
      await expect(page.locator('a[data-folder-name="Created in home"]')).toBeVisible();
    });
  }
}
