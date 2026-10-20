import { prisma } from '@documenso/prisma';
import { DocumentVisibility, TeamMemberRole } from '@documenso/prisma/client';
import { seedBlankDocument } from '@documenso/prisma/seed/documents';
import { seedTeamMember } from '@documenso/prisma/seed/teams';
import { seedBlankTemplate } from '@documenso/prisma/seed/templates';
import { seedUser } from '@documenso/prisma/seed/users';
import { expect, test } from '@playwright/test';

import { apiSignin } from '../fixtures/authentication';
import { postTrpc } from '../fixtures/trpc';

for (const role of [TeamMemberRole.MEMBER, TeamMemberRole.MANAGER, TeamMemberRole.ADMIN]) {
  test(`${role}: document visibility is enforced in the editor and direct requests`, async ({ page }) => {
    const { team } = await seedUser();
    const member = await seedTeamMember({ teamId: team.id, role });
    const document = await seedBlankDocument(member, team.id, {
      internalVersion: 2,
      createDocumentOptions: { visibility: DocumentVisibility.MANAGER_AND_ABOVE },
    });
    await apiSignin({ page, email: member.email, redirectPath: `/t/${team.url}/documents/${document.id}/edit` });
    await page.locator('button[title="Settings"]').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Security', exact: true }).click();
    const selector = page.getByTestId('documentVisibilitySelectValue');
    if (role === TeamMemberRole.MEMBER) {
      await expect(selector).toHaveCount(0);
    } else {
      await expect(selector).toBeVisible();
    }
    const response = await postTrpc(page, team.id, 'envelope.update', {
      envelopeId: document.id,
      data: { visibility: DocumentVisibility.EVERYONE },
    });
    expect(response.status()).toBe(role === TeamMemberRole.MEMBER ? 403 : 200);
    expect((await prisma.envelope.findUniqueOrThrow({ where: { id: document.id } })).visibility).toBe(
      role === TeamMemberRole.MEMBER ? DocumentVisibility.MANAGER_AND_ABOVE : DocumentVisibility.EVERYONE,
    );
  });
}

test('document restriction does not prevent a member changing their own template visibility', async ({ page }) => {
  const { team } = await seedUser();
  const member = await seedTeamMember({ teamId: team.id, role: TeamMemberRole.MEMBER });
  const template = await seedBlankTemplate(member, team.id, {
    createTemplateOptions: { visibility: DocumentVisibility.MANAGER_AND_ABOVE, internalVersion: 2 },
  });
  await apiSignin({ page, email: member.email, redirectPath: `/t/${team.url}/templates` });
  const response = await postTrpc(page, team.id, 'envelope.update', {
    envelopeId: template.id,
    data: { visibility: DocumentVisibility.EVERYONE },
  });
  expect(response.status()).toBe(200);
  expect((await prisma.envelope.findUniqueOrThrow({ where: { id: template.id } })).visibility).toBe(
    DocumentVisibility.EVERYONE,
  );
});

test('manager cannot escalate someone else’s document to admin-only visibility', async ({ page }) => {
  const { user, team } = await seedUser();
  const manager = await seedTeamMember({ teamId: team.id, role: TeamMemberRole.MANAGER });
  const document = await seedBlankDocument(user, team.id, {
    internalVersion: 2,
    createDocumentOptions: { visibility: DocumentVisibility.EVERYONE },
  });
  await apiSignin({ page, email: manager.email, redirectPath: `/t/${team.url}/documents` });
  const response = await postTrpc(page, team.id, 'envelope.update', {
    envelopeId: document.id,
    data: { visibility: DocumentVisibility.ADMIN },
  });
  expect(response.status()).toBe(403);
  expect((await prisma.envelope.findUniqueOrThrow({ where: { id: document.id } })).visibility).toBe(
    DocumentVisibility.EVERYONE,
  );
});
