import { DOCUMENT_AUDIT_LOG_TYPE } from '@documenso/lib/types/document-audit-logs';
import { prisma } from '@documenso/prisma';
import { seedBlankDocument } from '@documenso/prisma/seed/documents';
import { seedTeamMember } from '@documenso/prisma/seed/teams';
import { seedUser } from '@documenso/prisma/seed/users';
import { expect, test } from '@playwright/test';
import { EmailDeliveryStatus, type Prisma } from '@prisma/client';

import { apiSignin } from '../fixtures/authentication';

const recipientData = {
  recipientEmail: 'signer@example.invalid',
  recipientName: 'Activity Signer',
  recipientId: 1,
  recipientRole: 'SIGNER',
};

test('popup fetches the latest ten matching events and links to the standard paginated activity table', async ({
  page,
}) => {
  const { user, team } = await seedUser();
  const envelope = await seedBlankDocument(user, team.id, { internalVersion: 2, key: 'Activity pagination' });
  const now = Date.now();

  await prisma.documentAuditLog.createMany({
    data: [
      ...Array.from({ length: 12 }, (_, index) => ({
        envelopeId: envelope.id,
        type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_SENT,
        data: {},
        userId: user.id,
        createdAt: new Date(now - index * 1000),
      })),
      ...Array.from({ length: 12 }, (_, index) => ({
        envelopeId: envelope.id,
        type: DOCUMENT_AUDIT_LOG_TYPE.EMAIL_SENT,
        data: {
          ...recipientData,
          recipientEmail: `reminder-${index + 1}@example.invalid`,
          emailType: 'REMINDER',
          isResending: false,
        },
        createdAt: new Date(now - 60_000 - index * 1000),
      })),
    ],
  });

  await apiSignin({ page, email: user.email, redirectPath: `/t/${team.url}/documents` });
  const bell = page.getByRole('button', { name: 'Latest activity', exact: true });
  await expect(bell).toBeVisible();
  await bell.click();
  const popup = page.getByRole('dialog', { name: 'Latest activity' });
  await expect(popup.getByRole('listitem')).toHaveCount(10);
  await expect(popup.getByText('You sent the document')).toHaveCount(10);

  await popup.getByRole('button', { name: '12 Reminders', exact: true }).click();
  await expect(popup.getByRole('listitem')).toHaveCount(10);
  await expect(popup.getByText('Reminder sent to reminder-1@example.invalid', { exact: true })).toBeVisible();
  await expect(popup.getByText('Reminder sent to reminder-10@example.invalid', { exact: true })).toBeVisible();
  await expect(popup.getByText('Reminder sent to reminder-11@example.invalid', { exact: true })).toHaveCount(0);
  await expect(popup.getByText('You sent the document')).toHaveCount(0);

  await popup.getByRole('link', { name: 'View all activity' }).click();
  await expect(page.getByRole('combobox', { name: 'Event type' })).toHaveText('Reminders');
  await expect(page.getByTestId('data-table-count')).toHaveText('Showing 10 results.');
  await page.getByRole('button', { name: 'Go to last page' }).click();
  await expect(page.getByText('Page 2 of 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('table').getByRole('row')).toHaveCount(3);

  await page.getByRole('combobox', { name: 'Event type' }).click();
  await page.getByRole('option', { name: 'All', exact: true }).click();
  await expect(page.getByText('Page 1 of 3', { exact: true })).toBeVisible();
  await expect(page.getByTestId('data-table-count')).toHaveText('Showing 10 results.');
  await page.getByRole('combobox').last().click();
  await page.getByRole('option', { name: '20', exact: true }).click();
  await expect(page.getByTestId('data-table-count')).toHaveText('Showing 20 results.');
  await page.getByRole('button', { name: 'Go to next page' }).click();
  await expect(page.getByTestId('data-table-count')).toHaveText('Showing 4 results.');
  await page.getByRole('button', { name: 'Go to first page' }).click();
  await expect(page.getByText('Page 1 of 2', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Search envelopes' }).fill('missing-envelope');
  await expect(page.getByText('No recent activity', { exact: true })).toBeVisible();
});

test('counts actionable updates once and preserves per-event read state across the popup, page, and reloads', async ({
  page,
}) => {
  const { user, team } = await seedUser();
  const envelope = await seedBlankDocument(user, team.id, { internalVersion: 2, key: 'Unread activity' });
  const event = (
    type: string,
    data: Prisma.InputJsonObject,
    email: string | null = null,
    userId: number | null = null,
  ) => ({ envelopeId: envelope.id, type, data, email, userId });

  const [signature] = await prisma.$transaction([
    prisma.documentAuditLog.create({
      data: event(
        DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_RECIPIENT_COMPLETED,
        { ...recipientData, actionAuth: [] },
        recipientData.recipientEmail,
      ),
    }),
    prisma.documentAuditLog.createMany({
      data: [
        event(DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_COMPLETED, { transactionId: 'activity-test' }),
        event(DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_SENT, {}, user.email, user.id),
        event(
          DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_RECIPIENT_COMPLETED,
          { ...recipientData, actionAuth: [] },
          user.email.toUpperCase(),
        ),
        event(
          DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_RECIPIENT_COMPLETED,
          { ...recipientData, actionAuth: [] },
          null,
          user.id,
        ),
        event(
          DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_RECIPIENT_COMPLETED,
          { ...recipientData, recipientRole: 'APPROVER', actionAuth: [] },
          'approver@example.invalid',
        ),
        event(DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_OPENED, { ...recipientData, accessAuth: [] }),
        event(DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_PREVIEW_OPENED, {}),
        event(
          DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_RECIPIENT_REJECTED,
          { ...recipientData, reason: 'Declined' },
          recipientData.recipientEmail,
        ),
        ...[
          EmailDeliveryStatus.BOUNCED,
          EmailDeliveryStatus.BLOCKED,
          EmailDeliveryStatus.SPAM_COMPLAINT,
          EmailDeliveryStatus.SEND_FAILED,
          EmailDeliveryStatus.DELIVERED,
          EmailDeliveryStatus.DELAYED,
        ].map((status) =>
          event(DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_PREVIEW_EMAIL_DELIVERY_UPDATED, {
            recipientEmail: `${status.toLowerCase()}@example.invalid`,
            status,
            attemptId: status,
            occurredAt: new Date().toISOString(),
            failureCode: null,
          }),
        ),
      ],
    }),
  ]);

  await apiSignin({ page, email: user.email, redirectPath: `/t/${team.url}/documents` });
  const bell = page.getByRole('button', { name: /^Latest activity/ });
  await expect(bell).toHaveAccessibleName('Latest activity (6 new)');
  await bell.click();
  const popup = page.getByRole('dialog', { name: 'Latest activity' });
  await expect(popup.getByRole('listitem')).toHaveCount(10);
  await expect(bell).toHaveAccessibleName('Latest activity (6 new)');
  await popup.getByRole('button', { name: /^\d+ Completed$/ }).click();
  const signatureRow = popup.getByRole('listitem').filter({ hasText: 'signer@example.invalid signed the document' });
  await expect(signatureRow.getByText('Unread', { exact: true })).toHaveCount(1);
  await signatureRow.getByRole('link').click();
  await expect(page.getByRole('heading', { name: 'Recent activity', exact: true })).toBeVisible();
  await expect(bell).toHaveAccessibleName('Latest activity (5 new)');

  await page.reload();
  await expect(bell).toHaveAccessibleName('Latest activity (5 new)');
  await bell.click();
  await popup.getByRole('button', { name: /^\d+ Completed$/ }).click();
  await expect(
    popup
      .getByRole('listitem')
      .filter({ hasText: 'signer@example.invalid signed the document' })
      .getByText('Unread', { exact: true }),
  ).toHaveCount(0);
  await popup.getByRole('link', { name: 'View all activity' }).click();
  await page.getByRole('combobox', { name: 'Event type' }).click();
  await page.getByRole('option', { name: 'All', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Unread', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Unread', exact: true })).toBeChecked();
  await expect(page.getByTestId('data-table-count')).toHaveText('Showing 5 results.');
  const bounce = page.getByRole('row').filter({ hasText: 'Preview email bounced for bounced@example.invalid' });
  await expect(bounce.getByText('Unread', { exact: true })).toHaveCount(1);
  await bounce.getByRole('link').click();
  await expect(page.getByRole('heading', { name: 'Recent activity', exact: true })).toBeVisible();
  await expect(bell).toHaveAccessibleName('Latest activity (4 new)');
  await page.goBack();
  await expect(page.getByTestId('data-table-count')).toHaveText('Showing 4 results.');
  await expect(page.getByText('Preview email bounced for bounced@example.invalid', { exact: true })).toHaveCount(0);

  expect(
    await page.evaluate(
      ({ userId, teamId, eventId }) => {
        const state = JSON.parse(localStorage.getItem(`read-envelope-activity:${userId}:${teamId}`) ?? '{}');
        return typeof state[eventId];
      },
      { userId: user.id, teamId: team.id, eventId: signature.id },
    ),
  ).toBe('number');
});

test('date ranges and envelope search keep activity scoped to the selected owner and team', async ({ page }) => {
  const { user, team } = await seedUser();
  const member = await seedTeamMember({ teamId: team.id });
  const memberPersonalTeam = await prisma.team.findFirstOrThrow({
    where: { organisation: { ownerUserId: member.id } },
  });
  const visible = await seedBlankDocument(user, team.id, { internalVersion: 2, key: 'Historical owner envelope' });
  const otherOwner = await seedBlankDocument(member, team.id, { internalVersion: 2, key: 'Other owner envelope' });
  const otherTeam = await seedBlankDocument(user, memberPersonalTeam.id, {
    internalVersion: 2,
    key: 'Other team envelope',
  });

  await prisma.documentAuditLog.createMany({
    data: [visible, otherOwner, otherTeam].map((envelope) => ({
      envelopeId: envelope.id,
      type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_RECIPIENT_COMPLETED,
      data: { ...recipientData, actionAuth: [] },
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      email: recipientData.recipientEmail,
    })),
  });

  await apiSignin({ page, email: user.email, redirectPath: `/t/${team.url}/activity` });
  await expect(page.getByText('No recent activity', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Date range' }).click();
  await page.getByRole('option', { name: 'Last 7 days', exact: true }).click();
  await expect(page.getByText('No recent activity', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Date range' }).click();
  await page.getByRole('option', { name: 'Last 30 days', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: visible.title }).getByRole('link')).toBeVisible();
  await expect(page.getByTestId('data-table-count')).toHaveText('Showing 1 result.');
  await expect(page.getByRole('row').filter({ hasText: otherOwner.title })).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: otherTeam.title })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Date range' }).click();
  await page.getByRole('option', { name: 'All Time', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Unread', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Unread', exact: true })).toBeChecked();
  await page.getByRole('textbox', { name: 'Search envelopes' }).fill('Historical owner');
  await expect(page.getByTestId('data-table-count')).toHaveText('Showing 1 result.');
  await page.getByRole('row').filter({ hasText: visible.title }).getByRole('link').click();
  await expect(page.getByRole('heading', { name: 'Recent activity', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByText('No recent activity', { exact: true })).toBeVisible();
});
