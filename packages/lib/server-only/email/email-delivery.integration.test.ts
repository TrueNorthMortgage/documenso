import { randomUUID } from 'node:crypto';

import { prisma } from '@documenso/prisma';
import {
  DocumentSource,
  DocumentStatus,
  EmailDeliveryPurpose,
  EmailDeliveryStatus,
  EnvelopeType,
} from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { hasEmailDeliveryWarning } from '../../universal/email-delivery';
import { applyEmailDeliveryStatus, processPostmarkEvent, withEmailDeliveryTransaction } from './email-delivery';
import { normalizePostmarkEvent, ZPostmarkEventSchema } from './postmark-event';

// Opt in explicitly against a local development database. Never use existing recipients as fixtures.
// biome-ignore lint/nursery/noUndeclaredEnvVars: This manual integration check runs outside Turbo.
describe.skipIf(process.env.DOCUMENSO_RUN_EMAIL_DELIVERY_INTEGRATION !== 'true')('email delivery persistence', () => {
  it('deduplicates concurrent events, isolates old attempts, and rolls back failed transactions', async () => {
    const databaseUrl = new URL(process.env.NEXT_PRIVATE_DATABASE_URL ?? '');
    // biome-ignore lint/nursery/noUndeclaredEnvVars: Explicit test-only target for a local container database.
    const testDatabaseHost = process.env.DOCUMENSO_EMAIL_DELIVERY_TEST_DATABASE_HOST ?? 'localhost';
    expect([testDatabaseHost, 'localhost', '127.0.0.1']).toContain(databaseUrl.hostname);
    const seed = await prisma.envelope.findFirstOrThrow({ select: { userId: true, teamId: true } });
    const fixtureId = `doc78-test-${randomUUID()}`;
    const metadata = await prisma.documentMeta.create({ data: {} });

    try {
      const envelope = await prisma.envelope.create({
        data: {
          id: fixtureId,
          secondaryId: fixtureId,
          userId: seed.userId,
          teamId: seed.teamId,
          documentMetaId: metadata.id,
          title: 'DOC-78 temporary integration fixture',
          type: EnvelopeType.DOCUMENT,
          status: DocumentStatus.PENDING,
          source: DocumentSource.DOCUMENT,
          internalVersion: 2,
        },
      });
      const recipient = await prisma.recipient.create({
        data: {
          envelopeId: envelope.id,
          email: 'doc78-test@example.invalid',
          token: randomUUID(),
        },
      });
      const oldAttempt = await prisma.emailDeliveryAttempt.create({
        data: {
          envelopeId: envelope.id,
          recipientId: recipient.id,
          recipientEmail: recipient.email,
          purpose: EmailDeliveryPurpose.INVITATION,
          operationKey: randomUUID(),
          provider: 'POSTMARK',
          providerScope: 'integration-scope',
          messageStream: 'outbound',
        },
      });
      await prisma.recipient.update({
        where: { id: recipient.id },
        data: {
          latestEmailDeliveryAttemptId: oldAttempt.id,
          emailDeliveryStatus: EmailDeliveryStatus.PENDING,
          emailDeliveryEmail: recipient.email,
        },
      });
      const bounce = normalizePostmarkEvent(
        ZPostmarkEventSchema.parse({
          RecordType: 'Bounce',
          MessageID: randomUUID(),
          ServerID: 23,
          MessageStream: 'outbound',
          ID: 123,
          Email: recipient.email,
          BouncedAt: new Date().toISOString(),
          Type: 'HardBounce',
          Inactive: true,
          Metadata: { deliveryAttemptId: oldAttempt.id, deliveryScope: oldAttempt.providerScope },
        }),
      );

      const outcomes = await Promise.all([processPostmarkEvent(bounce), processPostmarkEvent(bounce)]);
      expect(outcomes.sort()).toEqual(['DUPLICATE', 'MATCHED']);
      expect(await prisma.emailDeliveryEvent.count({ where: { attemptId: oldAttempt.id } })).toBe(1);
      expect(await prisma.documentAuditLog.count({ where: { envelopeId: envelope.id } })).toBe(1);
      expect(hasEmailDeliveryWarning(await prisma.recipient.findUniqueOrThrow({ where: { id: recipient.id } }))).toBe(
        true,
      );

      const correctedEmail = 'doc78-corrected@example.invalid';
      const newAttempt = await prisma.emailDeliveryAttempt.create({
        data: {
          envelopeId: envelope.id,
          recipientId: recipient.id,
          recipientEmail: correctedEmail,
          purpose: EmailDeliveryPurpose.RESEND,
          operationKey: randomUUID(),
          provider: 'POSTMARK',
          providerScope: 'integration-scope',
          messageStream: 'outbound',
        },
      });
      await prisma.recipient.update({
        where: { id: recipient.id },
        data: {
          email: correctedEmail,
          latestEmailDeliveryAttemptId: newAttempt.id,
          emailDeliveryStatus: EmailDeliveryStatus.PENDING,
          emailDeliveryEmail: correctedEmail,
        },
      });
      await processPostmarkEvent({
        ...bounce,
        eventKey: randomUUID(),
        eventType: 'SpamComplaint',
        status: EmailDeliveryStatus.SPAM_COMPLAINT,
      });
      expect((await prisma.recipient.findUniqueOrThrow({ where: { id: recipient.id } })).emailDeliveryStatus).toBe(
        EmailDeliveryStatus.PENDING,
      );

      const delivery = normalizePostmarkEvent(
        ZPostmarkEventSchema.parse({
          RecordType: 'Delivery',
          MessageID: randomUUID(),
          ServerID: 23,
          MessageStream: 'outbound',
          Recipient: correctedEmail,
          DeliveredAt: new Date().toISOString(),
          Metadata: { deliveryAttemptId: newAttempt.id, deliveryScope: newAttempt.providerScope },
        }),
      );
      await processPostmarkEvent(delivery);
      await withEmailDeliveryTransaction(async (tx) => {
        const current = await tx.emailDeliveryAttempt.findUniqueOrThrow({ where: { id: newAttempt.id } });
        await applyEmailDeliveryStatus(tx, current, {
          status: EmailDeliveryStatus.ACCEPTED,
          occurredAt: new Date(),
          failureCode: null,
        });
      });
      expect((await prisma.recipient.findUniqueOrThrow({ where: { id: recipient.id } })).emailDeliveryStatus).toBe(
        EmailDeliveryStatus.DELIVERED,
      );

      const logCount = await prisma.documentAuditLog.count({ where: { envelopeId: envelope.id } });
      await expect(
        withEmailDeliveryTransaction(async (tx) => {
          const current = await tx.emailDeliveryAttempt.findUniqueOrThrow({ where: { id: newAttempt.id } });
          await applyEmailDeliveryStatus(tx, current, {
            status: EmailDeliveryStatus.BOUNCED,
            occurredAt: new Date(),
            failureCode: 'HardBounce',
          });
          throw new Error('simulated transaction failure');
        }),
      ).rejects.toThrow('simulated transaction failure');
      expect((await prisma.recipient.findUniqueOrThrow({ where: { id: recipient.id } })).emailDeliveryStatus).toBe(
        EmailDeliveryStatus.DELIVERED,
      );
      expect(await prisma.documentAuditLog.count({ where: { envelopeId: envelope.id } })).toBe(logCount);
    } finally {
      await prisma.envelope.deleteMany({ where: { id: fixtureId } });
      await prisma.documentMeta.delete({ where: { id: metadata.id } });
    }
  });
});
