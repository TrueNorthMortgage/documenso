import { createHash } from 'node:crypto';

import { EmailDeliveryStatus } from '@prisma/client';
import { z } from 'zod';

const baseSchema = z.object({
  MessageID: z.string().min(1).max(255),
  MessageStream: z.string().min(1).max(255),
  ServerID: z.number().int().positive(),
  Metadata: z
    .preprocess(
      (value) => {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return value;
        }

        // SMTP header names are case-insensitive; Nodemailer normalizes custom-header casing.
        return Object.fromEntries(Object.entries(value).map(([key, fieldValue]) => [key.toLowerCase(), fieldValue]));
      },
      z.object({
        deliveryattemptid: z.string().min(1).max(255).optional(),
        deliveryscope: z.string().min(1).max(128).optional(),
      }),
    )
    .optional()
    .default({})
    .transform((metadata) => ({
      deliveryAttemptId: metadata.deliveryattemptid,
      deliveryScope: metadata.deliveryscope,
    })),
});

const bounceFields = {
  Email: z.string().email().max(255),
  BouncedAt: z
    .string()
    .datetime({ offset: true })
    .transform((value) => new Date(value)),
  ID: z.number().int().positive(),
  Type: z.string().min(1).max(100),
  Inactive: z.boolean(),
};

// Zod strips subjects, bodies, bounce dumps and raw server responses.
export const ZPostmarkEventSchema = z.discriminatedUnion('RecordType', [
  baseSchema.extend({
    RecordType: z.literal('Delivery'),
    Recipient: z.string().email().max(255),
    DeliveredAt: z
      .string()
      .datetime({ offset: true })
      .transform((value) => new Date(value)),
  }),
  baseSchema.extend({ RecordType: z.literal('Bounce'), ...bounceFields }),
  baseSchema.extend({ RecordType: z.literal('SpamComplaint'), ...bounceFields }),
]);

export const normalizePostmarkEvent = (payload: z.infer<typeof ZPostmarkEventSchema>) => {
  const recipientEmail = (payload.RecordType === 'Delivery' ? payload.Recipient : payload.Email).toLowerCase();
  const occurredAt = payload.RecordType === 'Delivery' ? payload.DeliveredAt : payload.BouncedAt;
  let status: EmailDeliveryStatus = EmailDeliveryStatus.DELIVERED;
  let failureCode: string | null = null;

  if (payload.RecordType === 'SpamComplaint' || (payload.RecordType === 'Bounce' && payload.Type === 'SpamComplaint')) {
    status = EmailDeliveryStatus.SPAM_COMPLAINT;
    failureCode = 'SpamComplaint';
  } else if (payload.RecordType === 'Bounce') {
    failureCode = payload.Type;

    if (['Transient', 'SoftBounce', 'DnsError'].includes(payload.Type) && !payload.Inactive) {
      status = EmailDeliveryStatus.DELAYED;
    } else if (['SMTPApiError', 'ManuallyDeactivated', 'SpamNotification'].includes(payload.Type)) {
      status = EmailDeliveryStatus.BLOCKED;
    } else {
      status = EmailDeliveryStatus.BOUNCED;
    }
  }

  // Natural identity deduplicates even if a retry has a different/missing trace header.
  const eventKey = createHash('sha256')
    .update(
      JSON.stringify([
        'POSTMARK',
        payload.ServerID,
        payload.MessageStream,
        payload.RecordType,
        payload.MessageID,
        recipientEmail,
        occurredAt.toISOString(),
        payload.RecordType === 'Delivery' ? null : payload.ID,
      ]),
    )
    .digest('hex');

  return {
    eventKey,
    providerMessageId: payload.MessageID,
    serverId: payload.ServerID,
    messageStream: payload.MessageStream,
    recipientEmail,
    attemptId: payload.Metadata.deliveryAttemptId,
    providerScope: payload.Metadata.deliveryScope,
    eventType: payload.RecordType,
    status,
    occurredAt,
    failureCode,
  };
};

export type NormalizedPostmarkEvent = ReturnType<typeof normalizePostmarkEvent>;
