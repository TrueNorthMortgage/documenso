import { EmailDeliveryStatus, RecipientRole, SigningStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { hasEmailDeliveryWarning, reduceEmailDeliveryStatus } from './email-delivery';

const earlier = new Date('2026-10-05T12:00:00Z');
const later = new Date('2026-10-05T12:01:00Z');

describe('email delivery status reduction', () => {
  it.each([
    [EmailDeliveryStatus.BOUNCED, EmailDeliveryStatus.DELIVERED, EmailDeliveryStatus.BOUNCED],
    [EmailDeliveryStatus.BLOCKED, EmailDeliveryStatus.ACCEPTED, EmailDeliveryStatus.BLOCKED],
    [EmailDeliveryStatus.SPAM_COMPLAINT, EmailDeliveryStatus.DELIVERED, EmailDeliveryStatus.SPAM_COMPLAINT],
    [EmailDeliveryStatus.DELIVERED, EmailDeliveryStatus.SEND_FAILED, EmailDeliveryStatus.DELIVERED],
    [EmailDeliveryStatus.DELIVERED, EmailDeliveryStatus.ACCEPTED, EmailDeliveryStatus.DELIVERED],
    [EmailDeliveryStatus.DELIVERED, EmailDeliveryStatus.DELAYED, EmailDeliveryStatus.DELIVERED],
    [EmailDeliveryStatus.DELAYED, EmailDeliveryStatus.DELIVERED, EmailDeliveryStatus.DELIVERED],
    [EmailDeliveryStatus.SEND_FAILED, EmailDeliveryStatus.DELIVERED, EmailDeliveryStatus.DELIVERED],
    [EmailDeliveryStatus.DELIVERED, EmailDeliveryStatus.BOUNCED, EmailDeliveryStatus.BOUNCED],
  ])('reduces %s followed by %s to %s', (current, incoming, expected) => {
    expect(
      reduceEmailDeliveryStatus({ status: current, statusAt: earlier }, { status: incoming, occurredAt: later }),
    ).toBe(expected);
  });

  it('preserves a newer provider state when an older temporary event arrives', () => {
    expect(
      reduceEmailDeliveryStatus(
        { status: EmailDeliveryStatus.DELIVERED, statusAt: later },
        { status: EmailDeliveryStatus.DELAYED, occurredAt: earlier },
      ),
    ).toBe(EmailDeliveryStatus.DELIVERED);
  });

  it('produces delivered in either arrival order for delivery and temporary failure', () => {
    expect(
      reduceEmailDeliveryStatus(
        { status: EmailDeliveryStatus.DELAYED, statusAt: later },
        { status: EmailDeliveryStatus.DELIVERED, occurredAt: earlier },
      ),
    ).toBe(EmailDeliveryStatus.DELIVERED);
    expect(
      reduceEmailDeliveryStatus(
        { status: EmailDeliveryStatus.DELIVERED, statusAt: earlier },
        { status: EmailDeliveryStatus.DELAYED, occurredAt: later },
      ),
    ).toBe(EmailDeliveryStatus.DELIVERED);
  });

  it('records an early provider event even when acceptance has a later local timestamp', () => {
    expect(
      reduceEmailDeliveryStatus(
        { status: EmailDeliveryStatus.ACCEPTED, statusAt: later },
        { status: EmailDeliveryStatus.DELIVERED, occurredAt: earlier },
      ),
    ).toBe(EmailDeliveryStatus.DELIVERED);
  });
});

describe('sender delivery warning', () => {
  const recipient = {
    email: 'signer@example.com',
    emailDeliveryEmail: 'SIGNER@example.com',
    emailDeliveryStatus: EmailDeliveryStatus.BOUNCED,
    signingStatus: SigningStatus.NOT_SIGNED,
    role: RecipientRole.SIGNER,
  };

  it('warns about a current unsigned recipient failure', () => {
    expect(hasEmailDeliveryWarning(recipient)).toBe(true);
  });

  it('does not warn after correction, signing, deletion, or for CC/temporary/legacy states', () => {
    expect(hasEmailDeliveryWarning({ ...recipient, email: 'corrected@example.com' })).toBe(false);
    expect(hasEmailDeliveryWarning({ ...recipient, signingStatus: SigningStatus.SIGNED })).toBe(false);
    expect(hasEmailDeliveryWarning({ ...recipient, documentDeletedAt: later })).toBe(false);
    expect(hasEmailDeliveryWarning({ ...recipient, role: RecipientRole.CC })).toBe(false);
    expect(hasEmailDeliveryWarning({ ...recipient, emailDeliveryStatus: EmailDeliveryStatus.DELAYED })).toBe(false);
    expect(hasEmailDeliveryWarning({ ...recipient, emailDeliveryStatus: null })).toBe(false);
  });
});
