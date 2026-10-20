import { randomUUID } from 'node:crypto';
import { processPostmarkEvent } from '@documenso/lib/server-only/email/email-delivery';
import { normalizePostmarkEvent, ZPostmarkEventSchema } from '@documenso/lib/server-only/email/postmark-event';
import { prisma } from '@documenso/prisma';
import { DocumentStatus, EmailDeliveryPurpose, EmailDeliveryStatus } from '@documenso/prisma/client';
import { seedDraftDocument } from '@documenso/prisma/seed/documents';
import { seedUser } from '@documenso/prisma/seed/users';
import { expect, test } from '@playwright/test';

import { apiSignin } from '../fixtures/authentication';

test('delivery events update the real document UI and audit log without duplicate entries', async ({ page }) => {
  const { user, team } = await seedUser();
  const document = await seedDraftDocument(user, team.id, ['delivery@example.invalid'], {
    internalVersion: 2,
    createDocumentOptions: { status: DocumentStatus.PENDING },
  });
  const recipient = await prisma.recipient.findFirstOrThrow({ where: { envelopeId: document.id } });
  const attempt = await prisma.emailDeliveryAttempt.create({
    data: {
      envelopeId: document.id,
      recipientId: recipient.id,
      recipientEmail: recipient.email,
      purpose: EmailDeliveryPurpose.INVITATION,
      operationKey: randomUUID(),
      provider: 'POSTMARK',
      providerScope: randomUUID(),
      messageStream: 'outbound',
    },
  });
  await prisma.recipient.update({
    where: { id: recipient.id },
    data: {
      latestEmailDeliveryAttemptId: attempt.id,
      emailDeliveryStatus: EmailDeliveryStatus.PENDING,
      emailDeliveryEmail: recipient.email,
    },
  });
  const common = {
    MessageID: randomUUID(),
    MessageStream: 'outbound',
    ServerID: 23,
    Metadata: { deliveryAttemptId: attempt.id, deliveryScope: attempt.providerScope },
  };
  // Exercise actual event validation, persistence and browser rendering without contacting Postmark.
  const delivery = normalizePostmarkEvent(
    ZPostmarkEventSchema.parse({
      ...common,
      RecordType: 'Delivery',
      Recipient: recipient.email,
      DeliveredAt: new Date().toISOString(),
    }),
  );
  expect(await processPostmarkEvent(delivery)).toBe('MATCHED');
  expect(await processPostmarkEvent(delivery)).toBe('DUPLICATE');
  await apiSignin({ page, email: user.email, redirectPath: `/t/${team.url}/documents/${document.id}` });
  await expect(page.getByText('Email delivered.', { exact: true })).toBeVisible();
  const bounce = normalizePostmarkEvent(
    ZPostmarkEventSchema.parse({
      ...common,
      RecordType: 'Bounce',
      Email: recipient.email,
      BouncedAt: new Date(Date.now() + 1000).toISOString(),
      ID: 1,
      Type: 'HardBounce',
      Inactive: true,
    }),
  );
  expect(await processPostmarkEvent(bounce)).toBe('MATCHED');
  expect(await processPostmarkEvent(bounce)).toBe('DUPLICATE');
  expect(await prisma.emailDeliveryEvent.count({ where: { attemptId: attempt.id } })).toBe(2);
  expect(
    await prisma.documentAuditLog.count({ where: { envelopeId: document.id, type: 'EMAIL_DELIVERY_UPDATED' } }),
  ).toBe(2);
  await page.goto(`/t/${team.url}/documents`);
  const row = page.getByRole('row').filter({ hasText: document.title });
  await expect(row.getByRole('link', { name: 'View email delivery issues' })).toBeVisible();
  await row.getByRole('link', { name: 'View email delivery issues' }).click();
  await expect(page.getByText('Email bounced. Check the address and resend.', { exact: true })).toBeVisible();
  await page.goto(`/t/${team.url}/documents/${document.id}/logs`);
  await expect(page.getByText(`Email delivered to ${recipient.email}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`Email bounced for ${recipient.email}`, { exact: true })).toBeVisible();
});
