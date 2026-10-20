import { prisma } from '@documenso/prisma';
import { DocumentVisibility, FolderType, TeamMemberRole } from '@documenso/prisma/client';
import { seedBlankFolder } from '@documenso/prisma/seed/folders';
import { seedTeamMember } from '@documenso/prisma/seed/teams';
import { seedUser } from '@documenso/prisma/seed/users';
import { expect, test } from '@playwright/test';

import { apiSignin } from '../fixtures/authentication';

for (const type of [FolderType.DOCUMENT, FolderType.TEMPLATE]) {
  test(`${type}: folder grid loads more and table preference survives reload`, async ({ page }) => {
    const { user, team } = await seedUser();
    const route = type === FolderType.DOCUMENT ? 'documents' : 'templates';
    await prisma.folder.createMany({
      data: Array.from({ length: 8 }, (_, index) => ({
        name: `Browse ${index}`,
        userId: user.id,
        teamId: team.id,
        type,
      })),
    });
    await apiSignin({ page, email: user.email, redirectPath: `/t/${team.url}/${route}` });
    await expect(page.getByTestId('folder-card-more-button')).toHaveCount(6);
    await page.getByRole('button', { name: 'Load more', exact: true }).click();
    await expect(page.getByTestId('folder-card-more-button')).toHaveCount(8);
    await expect(page.getByRole('button', { name: 'Load more', exact: true })).not.toBeVisible();
    await page.getByRole('button', { name: 'Table', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Browse 0', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse 7', exact: true })).not.toBeVisible();
    // Home has a separate document/template paginator; use the folder paginator first.
    await page.getByRole('button', { name: 'Go to next page', exact: true }).first().click();
    await expect(page.getByRole('link', { name: 'Browse 7', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Table', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await prisma.folder.createMany({
      data: Array.from({ length: 43 }, (_, index) => ({
        name: `Browse extra ${index}`,
        userId: user.id,
        teamId: team.id,
        type,
      })),
    });
    await page.getByRole('link', { name: 'View all folders' }).click();
    await expect(page.getByRole('link', { name: /^Browse / })).toHaveCount(50);
    await page.getByRole('button', { name: 'Go to next page', exact: true }).click();
    await expect(page.getByRole('link', { name: /^Browse / })).toHaveCount(1);
    await page.getByRole('button', { name: 'Grid', exact: true }).click();
    await expect(page.getByTestId('folder-card-more-button')).toHaveCount(50);
    await page.getByRole('button', { name: 'Load more', exact: true }).click();
    await expect(page.getByTestId('folder-card-more-button')).toHaveCount(51);
  });
}

test('nested folder search reveals matching descendants and clearing restores collapsed rows', async ({ page }) => {
  const { user, team } = await seedUser();
  const root = await seedBlankFolder(user, team.id, { createFolderOptions: { name: 'Tree root' } });
  const child = await seedBlankFolder(user, team.id, {
    createFolderOptions: { name: 'Tree child', parentId: root.id },
  });
  const grandchild = await seedBlankFolder(user, team.id, {
    createFolderOptions: { name: 'Tree grandchild', parentId: child.id },
  });
  await seedBlankFolder(user, team.id, { createFolderOptions: { name: 'Deep target', parentId: grandchild.id } });
  await apiSignin({ page, email: user.email, redirectPath: `/t/${team.url}/documents/folders` });
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Deep target', exact: true })).not.toBeVisible();
  for (const name of ['Tree root', 'Tree child', 'Tree grandchild']) {
    await page
      .getByRole('row')
      .filter({ has: page.getByRole('link', { name, exact: true }) })
      .getByRole('button', { name: 'Expand folder', exact: true })
      .click();
  }
  await expect(page.getByRole('link', { name: 'Deep target', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Table', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByPlaceholder(/Search folders/).fill('Deep target');
  await expect(page.getByRole('link', { name: 'Deep target', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Tree root', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear search', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Tree root', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Deep target', exact: true })).not.toBeVisible();
});

test('restricted folders stay hidden while loading and searching grid and table pages', async ({ page }) => {
  const { user, team } = await seedUser();
  const member = await seedTeamMember({ teamId: team.id, role: TeamMemberRole.MEMBER });
  await prisma.folder.createMany({
    data: Array.from({ length: 8 }, (_, index) => ({
      name: `Public ${index}`,
      userId: user.id,
      teamId: team.id,
      type: FolderType.DOCUMENT,
      visibility: DocumentVisibility.EVERYONE,
    })),
  });
  await seedBlankFolder(user, team.id, {
    createFolderOptions: { name: 'Secret folder', visibility: DocumentVisibility.ADMIN },
  });
  await apiSignin({ page, email: member.email, redirectPath: `/t/${team.url}/documents` });
  await page.getByRole('button', { name: 'Load more', exact: true }).click();
  await expect(page.locator('a[data-folder-id]')).toHaveCount(8);
  await expect(page.getByText('Secret folder', { exact: true })).not.toBeVisible();
  await page.getByPlaceholder(/Search folders/).fill('Secret');
  await expect(page.getByText('No folders found.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Table', exact: true }).click();
  await page.getByPlaceholder(/Search folders/).fill('Secret');
  await expect(page.getByText('No folders found.', { exact: true })).toBeVisible();
  await expect(page.getByText('Secret folder', { exact: true })).not.toBeVisible();
});
