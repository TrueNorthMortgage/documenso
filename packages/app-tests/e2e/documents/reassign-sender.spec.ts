import { prisma } from '@documenso/prisma';
import { DocumentStatus, TeamMemberRole } from '@documenso/prisma/client';
import { seedBlankDocument, seedDraftDocument } from '@documenso/prisma/seed/documents';
import { seedBlankFolder } from '@documenso/prisma/seed/folders';
import { seedTeamMember } from '@documenso/prisma/seed/teams';
import { seedUser } from '@documenso/prisma/seed/users';
import { expect, test } from '@playwright/test';

import { apiSignin, apiSignout } from '../fixtures/authentication';
import { postTrpc } from '../fixtures/trpc';

for (const existingFolder of [false, true]) {
  test(`reassign sender ${existingFolder ? 'reuses' : 'creates'} a pinned destination without changing other documents`, async ({
    page,
  }) => {
    const { user, team } = await seedUser();
    const member = await seedTeamMember({ teamId: team.id, role: TeamMemberRole.MEMBER, name: 'Transfer Target' });
    const destination = existingFolder
      ? await seedBlankFolder(member, team.id, { createFolderOptions: { name: 'Assigned to you', pinned: false } })
      : null;
    const untouched = await seedBlankDocument(member, team.id, {
      createDocumentOptions: { title: 'Keep this document', folderId: destination?.id },
    });
    const envelope = await seedDraftDocument(user, team.id, [user], { internalVersion: 2 });
    const before = await prisma.envelope.findUniqueOrThrow({
      where: { id: envelope.id },
      include: { recipients: true, fields: true, envelopeItems: true, documentMeta: true },
    });
    await apiSignin({ page, email: user.email, redirectPath: `/t/${team.url}/documents` });
    const row = page.getByRole('row').filter({ hasText: envelope.title });
    await row.getByTestId('document-table-action-btn').click();
    await page.getByRole('menuitem', { name: 'Reassign sender' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox').click();
    await page.getByPlaceholder('Search members by name or email').fill(member.email);
    await page.getByRole('option').filter({ hasText: member.email }).click();
    await dialog.getByRole('button', { name: 'Reassign sender', exact: true }).click();
    await expect(page.getByText('Sender reassigned', { exact: true })).toBeVisible();
    const folder = await prisma.folder.findFirstOrThrow({
      where: { userId: member.id, teamId: team.id, name: 'Assigned to you' },
    });
    expect(folder.pinned).toBe(true);
    if (destination) {
      expect(folder.id).toBe(destination.id);
    }
    const after = await prisma.envelope.findUniqueOrThrow({
      where: { id: envelope.id },
      include: { recipients: true, fields: true, envelopeItems: true, documentMeta: true },
    });
    expect(after.userId).toBe(member.id);
    expect(after.folderId).toBe(folder.id);
    expect(after.recipients).toEqual(before.recipients);
    expect(after.fields).toEqual(before.fields);
    expect(after.envelopeItems).toEqual(before.envelopeItems);
    expect(after.documentMeta).toEqual(before.documentMeta);
    expect(after.status).toBe(before.status);
    expect(await prisma.envelope.findUniqueOrThrow({ where: { id: untouched.id } })).toMatchObject({
      userId: member.id,
      folderId: untouched.folderId,
    });
    const audit = await prisma.documentAuditLog.findFirstOrThrow({
      where: { envelopeId: envelope.id, type: 'DOCUMENT_SENDER_REASSIGNED' },
    });
    expect(audit.data).toMatchObject({
      from: { id: user.id, email: user.email, name: user.name },
      to: { id: member.id, email: member.email, name: member.name },
    });
    await page.goto(`/t/${team.url}/documents/${envelope.id}/logs`);
    const activity = page.getByRole('row').filter({ hasText: 'reassigned the sender from' });
    await expect(activity).toContainText(user.email);
    await expect(activity).toContainText(member.email);
    await expect(activity).toContainText(member.name ?? '');
    await apiSignout({ page });
    await apiSignin({ page, email: member.email, redirectPath: `/t/${team.url}/documents` });
    const assignedFolder = page.locator(`a[data-folder-id="${folder.id}"]`);
    await expect(assignedFolder).toBeVisible();
    await assignedFolder.click();
    await expect(page.getByRole('link', { name: envelope.title, exact: true })).toBeVisible();
  });
}

test('bulk reassignment moves draft, pending and completed envelopes into one destination', async ({ page }) => {
  const { user, team } = await seedUser();
  const member = await seedTeamMember({ teamId: team.id, name: 'Bulk Transfer Target' });
  const documents = await Promise.all(
    [DocumentStatus.DRAFT, DocumentStatus.PENDING, DocumentStatus.COMPLETED].map((status) =>
      seedBlankDocument(user, team.id, {
        internalVersion: 2,
        createDocumentOptions: {
          status,
          title: `Transfer ${status}`,
          completedAt: status === DocumentStatus.COMPLETED ? new Date() : null,
        },
      }),
    ),
  );
  await apiSignin({ page, email: user.email, redirectPath: `/t/${team.url}/documents` });
  for (const document of documents) {
    await page.getByRole('row').filter({ hasText: document.title }).getByRole('checkbox').click();
  }
  await page.getByRole('button', { name: 'Reassign sender' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox').click();
  await page.getByPlaceholder('Search members by name or email').fill(member.email);
  await page.getByRole('option').filter({ hasText: member.email }).click();
  await expect(dialog.getByText('3 envelopes will be reassigned.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Reassign sender', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const updated = await prisma.envelope.findMany({ where: { id: { in: documents.map((document) => document.id) } } });
  expect(updated.every((document) => document.userId === member.id)).toBe(true);
  expect(new Set(updated.map((document) => document.folderId)).size).toBe(1);
  expect(updated.every((document) => document.folderId !== null)).toBe(true);
  for (const document of documents) {
    expect(updated.find((item) => item.id === document.id)).toMatchObject({
      status: document.status,
      completedAt: document.completedAt,
    });
  }
});

test('ordinary members cannot reassign through a direct request', async ({ page }) => {
  const { user, team } = await seedUser();
  const member = await seedTeamMember({ teamId: team.id, role: TeamMemberRole.MEMBER });
  const document = await seedBlankDocument(member, team.id, { internalVersion: 2 });
  await apiSignin({ page, email: member.email, redirectPath: `/t/${team.url}/documents` });
  const response = await postTrpc(page, team.id, 'envelope.reassignSender', {
    envelopeId: document.id,
    expectedOwnerId: member.id,
    newOwnerId: user.id,
  });
  expect(response.status()).toBe(403);
  expect(await prisma.envelope.findUniqueOrThrow({ where: { id: document.id } })).toMatchObject({
    userId: member.id,
    folderId: document.folderId,
  });
  expect(
    await prisma.documentAuditLog.count({ where: { envelopeId: document.id, type: 'DOCUMENT_SENDER_REASSIGNED' } }),
  ).toBe(0);
});

test('member picker caps results at 15 and finds members by name and email', async ({ page }) => {
  test.setTimeout(120_000);
  const { user, team } = await seedUser();
  const members = [];
  for (let index = 0; index < 16; index++) {
    members.push(await seedTeamMember({ teamId: team.id, name: `Candidate ${String(index).padStart(2, '0')}` }));
  }
  const document = await seedBlankDocument(user, team.id, { internalVersion: 2 });
  await apiSignin({ page, email: user.email, redirectPath: `/t/${team.url}/documents` });
  await page.getByRole('row').filter({ hasText: document.title }).getByTestId('document-table-action-btn').click();
  await page.getByRole('menuitem', { name: 'Reassign sender' }).click();
  await page.getByRole('dialog').getByRole('combobox').click();
  await expect(page.getByRole('option')).toHaveCount(15);
  await expect(page.getByRole('option').filter({ hasText: user.email })).toHaveCount(0);
  const target = members[15];
  const search = page.getByPlaceholder('Search members by name or email');
  await search.fill('Candidate 15');
  await expect(page.getByRole('option')).toHaveCount(1);
  await expect(page.getByRole('option')).toContainText(target.email);
  await search.fill(target.email);
  await expect(page.getByRole('option')).toHaveCount(1);
  await expect(page.getByRole('option')).toContainText(target.name ?? '');
  await search.fill('no-such-member@example.invalid');
  await expect(page.getByText('No members found', { exact: true })).toBeVisible();
});

test('stale sender and outside-team targets are rejected without moving or auditing', async ({ page }) => {
  const { user, team } = await seedUser();
  const target = await seedTeamMember({ teamId: team.id });
  const outsider = await seedUser();
  const document = await seedBlankDocument(user, team.id, { internalVersion: 2 });
  await apiSignin({ page, email: user.email, redirectPath: `/t/${team.url}/documents` });
  for (const input of [
    { expectedOwnerId: target.id, newOwnerId: target.id },
    { expectedOwnerId: user.id, newOwnerId: outsider.user.id },
  ]) {
    const response = await postTrpc(page, team.id, 'envelope.reassignSender', { envelopeId: document.id, ...input });
    expect(response.status()).toBe(400);
    expect((await response.json()).error.json.message).toBeTruthy();
  }
  expect(await prisma.envelope.findUniqueOrThrow({ where: { id: document.id } })).toMatchObject({
    userId: user.id,
    folderId: document.folderId,
  });
  expect(
    await prisma.documentAuditLog.count({ where: { envelopeId: document.id, type: 'DOCUMENT_SENDER_REASSIGNED' } }),
  ).toBe(0);
});
