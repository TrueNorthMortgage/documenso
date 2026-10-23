import { prisma } from '@documenso/prisma';
import { seedBlankDocument, seedDocuments, seedTeamDocuments } from '@documenso/prisma/seed/documents';
import { seedTeam, seedTeamEmail, seedTeamMember } from '@documenso/prisma/seed/teams';
import { seedUser } from '@documenso/prisma/seed/users';
import { expect, test } from '@playwright/test';
import { DocumentStatus, DocumentVisibility, TeamMemberRole } from '@prisma/client';

import { apiSignin, apiSignout } from '../fixtures/authentication';
import { checkDocumentTabCount } from '../fixtures/documents';
import { expectToastTextToBeVisible, openDropdownMenu } from '../fixtures/generic';

test('[TEAMS]: owner and internal email member share the team inbox', async ({ page }) => {
  const { team, teamOwner, teamMember4 } = await seedTeamDocuments();
  await seedTeamEmail({ email: teamMember4.email, teamId: team.id });
  const { user: sender, team: senderTeam } = await seedUser();
  await seedDocuments([
    { sender, recipients: [teamMember4], type: DocumentStatus.PENDING, teamId: senderTeam.id },
    { sender, recipients: [teamMember4], type: DocumentStatus.DRAFT, teamId: senderTeam.id },
  ]);

  for (const user of [teamOwner, teamMember4]) {
    await apiSignin({ page, email: user.email, redirectPath: `/t/${team.url}/documents` });
    await checkDocumentTabCount(page, 'Inbox', 1);
    await apiSignout({ page });
  }
});

test('[TEAMS]: check team documents count with external team email', async ({ page }) => {
  const { team, teamMember2 } = await seedTeamDocuments();

  const { team: team2, teamMember2: team2Member2 } = await seedTeamDocuments();

  const teamEmail = `external-team-email-${team.id}@test.documenso.com`;

  await seedTeamEmail({
    email: teamEmail,
    teamId: team.id,
  });

  const { user: testUser1, team: testUser1Team } = await seedUser({
    isPersonalOrganisation: true,
  });

  await seedDocuments([
    // Documents sent to the team email account.
    {
      sender: testUser1,
      recipients: [teamEmail],
      type: DocumentStatus.COMPLETED,
      teamId: testUser1Team.id,
    },
    {
      sender: testUser1,
      recipients: [teamEmail],
      type: DocumentStatus.PENDING,
      teamId: testUser1Team.id,
    },
    {
      sender: testUser1,
      recipients: [teamEmail],
      type: DocumentStatus.DRAFT,
      teamId: testUser1Team.id,
    },
    // Document sent to the team email account from another team.
    {
      sender: team2Member2,
      recipients: [teamEmail],
      type: DocumentStatus.PENDING,
      teamId: team2.id,
    },
    // Document sent to the team email account from an individual user.
    {
      sender: testUser1,
      recipients: [teamEmail],
      type: DocumentStatus.PENDING,
      teamId: testUser1Team.id,
    },
    {
      sender: testUser1,
      recipients: [teamEmail],
      type: DocumentStatus.DRAFT,
      teamId: testUser1Team.id,
    },
  ]);

  await apiSignin({
    page,
    email: teamMember2.email,
    redirectPath: `/t/${team.url}/documents`,
  });

  // Check document counts.
  await checkDocumentTabCount(page, 'Inbox', 3);
  await checkDocumentTabCount(page, 'Pending', 2);
  await checkDocumentTabCount(page, 'Completed', 2);
  await checkDocumentTabCount(page, 'Draft', 2);
  await checkDocumentTabCount(page, 'All', 9);
});

test('[TEAMS]: resend pending team document', async ({ page }) => {
  const { team, teamOwner, teamMember2: currentUser } = await seedTeamDocuments();

  await apiSignin({
    page,
    email: currentUser.email,
    redirectPath: `/t/${team.url}/documents?status=PENDING`,
  });

  const actionBtn = page.getByTestId('document-table-action-btn').first();
  await expect(actionBtn).toBeAttached();
  await openDropdownMenu(page, actionBtn);
  await expect(page.getByRole('menuitem', { name: 'Resend' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Resend' }).click();
  await page.getByLabel('test.documenso.com').first().click();
  await page.getByRole('button', { name: 'Send reminder' }).click();

  await expectToastTextToBeVisible(page, 'Document re-sent');
});

test('[TEAMS]: delete draft team document', async ({ page }) => {
  const { team, teamOwner, teamMember2: teamEmailMember, teamMember3 } = await seedTeamDocuments();

  await apiSignin({
    page,
    email: teamMember3.email,
    redirectPath: `/t/${team.url}/documents?status=DRAFT`,
  });

  const actionBtn = page.getByTestId('document-table-action-btn').first();
  await expect(actionBtn).toBeVisible();
  await openDropdownMenu(page, actionBtn);
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete' }).click();

  await checkDocumentTabCount(page, 'Draft', 1);

  // Verify the deletion is shared with the owner and another team member.
  for (const user of [teamOwner, teamEmailMember]) {
    await apiSignin({
      page,
      email: user.email,
      redirectPath: `/t/${team.url}/documents?status=DRAFT`,
    });
    await checkDocumentTabCount(page, 'Draft', 1);
  }
});

test('[TEAMS]: delete pending team document', async ({ page }) => {
  const { team, teamOwner, teamMember2: teamEmailMember, teamMember3 } = await seedTeamDocuments();

  await apiSignin({
    page,
    email: teamMember3.email,
    redirectPath: `/t/${team.url}/documents?status=PENDING`,
  });

  const actionBtn = page.getByTestId('document-table-action-btn').first();
  await expect(actionBtn).toBeVisible();
  await openDropdownMenu(page, actionBtn);
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Delete' }).click({ force: true });
  await page.getByPlaceholder("Type 'delete' to confirm").fill('delete');
  await page.getByRole('button', { name: 'Delete' }).click({ force: true });

  await checkDocumentTabCount(page, 'Pending', 1);

  // Verify the deletion is shared with the owner and another team member.
  for (const user of [teamOwner, teamEmailMember]) {
    await apiSignin({
      page,
      email: user.email,
      redirectPath: `/t/${team.url}/documents?status=PENDING`,
    });
    await checkDocumentTabCount(page, 'Pending', 1);
  }
});

test('[TEAMS]: delete completed team document', async ({ page }) => {
  const { team, teamOwner, teamMember2: teamEmailMember, teamMember3 } = await seedTeamDocuments();

  await apiSignin({
    page,
    email: teamMember3.email,
    redirectPath: `/t/${team.url}/documents?status=COMPLETED`,
  });

  const actionBtn = page.getByTestId('document-table-action-btn').first();
  await expect(actionBtn).toBeVisible();
  await openDropdownMenu(page, actionBtn);
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Delete' }).click({ force: true });
  await page.getByPlaceholder("Type 'delete' to confirm").fill('delete');
  await page.getByRole('button', { name: 'Delete' }).click({ force: true });

  await checkDocumentTabCount(page, 'Completed', 0);

  // Verify the deletion is shared with the owner and another team member.
  for (const user of [teamOwner, teamEmailMember]) {
    await apiSignin({
      page,
      email: user.email,
      redirectPath: `/t/${team.url}/documents?status=COMPLETED`,
    });
    await checkDocumentTabCount(page, 'Completed', 0);
  }
});

test('[TEAMS]: external recipient sees a restricted team document in their inbox', async ({ page }) => {
  const { team, owner } = await seedTeam();
  const { user: recipient } = await seedUser();
  await seedDocuments([
    {
      sender: owner,
      recipients: [recipient],
      type: DocumentStatus.COMPLETED,
      teamId: team.id,
      documentOptions: { visibility: DocumentVisibility.ADMIN, title: 'Restricted document for recipient' },
    },
  ]);
  await apiSignin({ page, email: recipient.email, redirectPath: '/inbox' });
  await expect(page.getByRole('cell', { name: 'Restricted document for recipient', exact: true })).toBeVisible();
});

test('[TEAMS]: check that ADMIN role can change document visibility', async ({ page }) => {
  const { team, owner } = await seedTeam();

  const adminUser = await seedTeamMember({
    teamId: team.id,
    role: TeamMemberRole.ADMIN,
  });

  const document = await seedBlankDocument(adminUser, team.id, {
    createDocumentOptions: {
      visibility: DocumentVisibility.MANAGER_AND_ABOVE,
    },
  });

  await apiSignin({
    page,
    email: adminUser.email,
    redirectPath: `/t/${team.url}/documents/${document.id}/edit`,
  });

  await page.getByTestId('documentVisibilitySelectValue').click();
  await page.getByLabel('Admins only').click();

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Add Signers' })).toBeVisible();

  await page.getByRole('button', { name: 'Go Back' }).click();
  await expect(page.getByRole('heading', { name: 'General' })).toBeVisible();

  await expect(page.getByTestId('documentVisibilitySelectValue')).toContainText('Admins only');
});

// Exercise the browser permission boundary at every visibility level. The complete
// role/ownership matrix is covered by packages/lib/utils/teams.test.ts.
for (const visibility of Object.values(DocumentVisibility)) {
  test(`[TEAMS]: MEMBER cannot change ${visibility} document visibility`, async ({ page }) => {
    const { team } = await seedTeam();
    const member = await seedTeamMember({ teamId: team.id, role: TeamMemberRole.MEMBER });
    const document = await seedBlankDocument(member, team.id, {
      createDocumentOptions: { visibility },
    });

    await apiSignin({
      page,
      email: member.email,
      redirectPath: `/t/${team.url}/documents/${document.id}/edit`,
    });

    await expect(page.getByRole('heading', { name: 'General', exact: true })).toBeVisible();
    await expect(page.getByTestId('documentVisibilitySelectValue')).toHaveCount(0);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Add Signers', exact: true })).toBeVisible();
    expect((await prisma.envelope.findUniqueOrThrow({ where: { id: document.id } })).visibility).toBe(visibility);
  });
}

test('[TEAMS]: MANAGER owner can change visibility of ADMIN documents', async ({ page }) => {
  const { team, owner } = await seedTeam();

  const teamManager = await seedTeamMember({
    teamId: team.id,
    role: TeamMemberRole.MANAGER,
  });

  const document = await seedBlankDocument(teamManager, team.id, {
    createDocumentOptions: {
      visibility: DocumentVisibility.ADMIN,
    },
  });

  await apiSignin({
    page,
    email: teamManager.email,
    redirectPath: `/t/${team.url}/documents/${document.id}/edit`,
  });

  await expect(page.getByTestId('documentVisibilitySelectValue')).toHaveText('Admins only');
  const visibilitySelect = page.getByRole('combobox').filter({
    has: page.getByTestId('documentVisibilitySelectValue'),
  });
  await expect(visibilitySelect).toBeEnabled();
  await visibilitySelect.click();
  await page.getByRole('option', { name: 'Everyone', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Add Signers', exact: true })).toBeVisible();
  expect((await prisma.envelope.findUniqueOrThrow({ where: { id: document.id } })).visibility).toBe(
    DocumentVisibility.EVERYONE,
  );
});
