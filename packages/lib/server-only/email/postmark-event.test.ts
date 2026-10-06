import { EmailDeliveryStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { normalizePostmarkEvent, ZPostmarkEventSchema } from './postmark-event';

const bounce = {
  RecordType: 'Bounce',
  MessageStream: 'outbound',
  ServerID: 23,
  MessageID: 'message-1',
  ID: 123,
  Email: 'signer@example.com',
  BouncedAt: '2026-10-05T12:00:00Z',
  Type: 'HardBounce',
  Inactive: true,
  Metadata: { deliveryAttemptId: 'attempt-1', deliveryScope: 'scope-1' },
};

describe('Postmark event normalization', () => {
  it('classifies the SMTP API error record as blocked even when Inactive is false', () => {
    const event = normalizePostmarkEvent(
      ZPostmarkEventSchema.parse({ ...bounce, RecordType: 'SMTPAPIError', Type: 'SMTPApiError', Inactive: false }),
    );
    expect(event.status).toBe(EmailDeliveryStatus.BLOCKED);
    expect(event.failureCode).toBe('SMTPApiError');
    expect(event.attemptId).toBe('attempt-1');
  });

  it('matches metadata after Nodemailer changes SMTP header casing', () => {
    const event = normalizePostmarkEvent(
      ZPostmarkEventSchema.parse({
        ...bounce,
        Metadata: { Deliveryattemptid: 'attempt-1', Deliveryscope: 'scope-1' },
      }),
    );
    expect(event.attemptId).toBe('attempt-1');
    expect(event.providerScope).toBe('scope-1');
  });

  it.each([
    ['HardBounce', true, EmailDeliveryStatus.BOUNCED],
    ['Transient', false, EmailDeliveryStatus.DELAYED],
    ['SoftBounce', false, EmailDeliveryStatus.DELAYED],
    ['SoftBounce', true, EmailDeliveryStatus.BOUNCED],
    ['SMTPApiError', false, EmailDeliveryStatus.BLOCKED],
    ['SpamComplaint', true, EmailDeliveryStatus.SPAM_COMPLAINT],
  ])('classifies %s (inactive %s)', (Type, Inactive, expected) => {
    expect(normalizePostmarkEvent(ZPostmarkEventSchema.parse({ ...bounce, Type, Inactive })).status).toBe(expected);
  });

  it('uses distinct keys for delivery and bounce on the same message, and for different servers', () => {
    const parsedBounce = normalizePostmarkEvent(ZPostmarkEventSchema.parse(bounce));
    const delivery = normalizePostmarkEvent(
      ZPostmarkEventSchema.parse({
        ...bounce,
        RecordType: 'Delivery',
        Recipient: bounce.Email,
        DeliveredAt: bounce.BouncedAt,
      }),
    );
    expect(delivery.eventKey).not.toBe(parsedBounce.eventKey);
    expect(normalizePostmarkEvent(ZPostmarkEventSchema.parse({ ...bounce, ServerID: 24 })).eventKey).not.toBe(
      parsedBounce.eventKey,
    );
    expect(normalizePostmarkEvent(ZPostmarkEventSchema.parse(bounce)).eventKey).toBe(parsedBounce.eventKey);
  });

  it('normalizes case and strips private payload details', () => {
    const parsed = ZPostmarkEventSchema.parse({
      ...bounce,
      Email: 'SIGNER@example.com',
      Content: 'private',
      Subject: 'private',
    });
    expect(parsed).not.toHaveProperty('Content');
    expect(parsed).not.toHaveProperty('Subject');
    expect(normalizePostmarkEvent(parsed).recipientEmail).toBe('signer@example.com');
  });

  it('accepts legacy events without metadata but rejects invalid timestamps or missing identity', () => {
    expect(
      normalizePostmarkEvent(ZPostmarkEventSchema.parse({ ...bounce, Metadata: undefined })).attemptId,
    ).toBeUndefined();
    expect(ZPostmarkEventSchema.safeParse({ ...bounce, BouncedAt: 'invalid' }).success).toBe(false);
    expect(ZPostmarkEventSchema.safeParse({ ...bounce, MessageID: '' }).success).toBe(false);
  });
});
