import { timingSafeEqual } from 'node:crypto';

import { env } from '@documenso/lib/utils/env';
import { prisma } from '@documenso/prisma';
import { EmailDeliveryStatus } from '@prisma/client';
import { z } from 'zod';

const ZPostmarkMetadataSchema = z.record(z.string()).default({});

const ZPostmarkDeliveryWebhookSchema = z.object({
  RecordType: z.literal('Delivery'),
  MessageID: z.string().min(1),
  Recipient: z.string().email(),
  DeliveredAt: z.coerce.date(),
  Metadata: ZPostmarkMetadataSchema,
});

const ZPostmarkFailureWebhookSchema = z.object({
  RecordType: z.enum(['Bounce', 'SpamComplaint']),
  MessageID: z.string().min(1),
  Type: z.string().min(1),
  Description: z.string().default('Email delivery failed'),
  Details: z.string().optional(),
  Email: z.string().email(),
  BouncedAt: z.coerce.date(),
  Metadata: ZPostmarkMetadataSchema,
});

const ZPostmarkWebhookSchema = z.discriminatedUnion('RecordType', [
  ZPostmarkDeliveryWebhookSchema,
  ZPostmarkFailureWebhookSchema,
]);

const secureCompare = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const isAuthorized = (request: Request) => {
  const expectedUsername = env('NEXT_PRIVATE_POSTMARK_WEBHOOK_USERNAME');
  const expectedPassword = env('NEXT_PRIVATE_POSTMARK_WEBHOOK_PASSWORD');

  if (!expectedUsername || !expectedPassword) {
    return false;
  }

  const authorization = request.headers.get('Authorization');

  if (!authorization?.startsWith('Basic ')) {
    return false;
  }

  try {
    const credentials = Buffer.from(authorization.slice('Basic '.length), 'base64').toString('utf8');
    const separatorIndex = credentials.indexOf(':');

    if (separatorIndex === -1) {
      return false;
    }

    const username = credentials.slice(0, separatorIndex);
    const password = credentials.slice(separatorIndex + 1);

    return secureCompare(username, expectedUsername) && secureCompare(password, expectedPassword);
  } catch {
    return false;
  }
};

export const handlePostmarkWebhook = async (request: Request) => {
  if (!isAuthorized(request)) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return new Response('Invalid webhook payload', { status: 400 });
  }

  const recordType = z.object({ RecordType: z.string() }).safeParse(body);

  if (recordType.success && !['Delivery', 'Bounce', 'SpamComplaint'].includes(recordType.data.RecordType)) {
    return Response.json({ processed: false });
  }

  const parsedPayload = ZPostmarkWebhookSchema.safeParse(body);

  if (!parsedPayload.success) {
    return new Response('Invalid webhook payload', { status: 400 });
  }

  const payload = parsedPayload.data;
  const deliveryId = payload.Metadata['delivery-id'];
  const envelopeId = payload.Metadata['envelope-id'];
  const recipientId = Number(payload.Metadata['recipient-id']);

  // Postmark reports hard bounces, soft bounces, transient failures, blocked
  // messages, and enabled SMTP API errors through its Bounce webhook.
  // Acknowledge unrelated Postmark email events. Only tracked recipient emails
  // include Documenso correlation metadata and can safely update an attempt.
  if (!deliveryId || !envelopeId || !Number.isInteger(recipientId)) {
    return Response.json({ processed: false });
  }

  const email = payload.RecordType === 'Delivery' ? payload.Recipient : payload.Email;
  const commonWhere = {
    id: deliveryId,
    envelopeId,
    recipientId,
    email: {
      equals: email,
      mode: 'insensitive' as const,
    },
    OR: [{ providerMessageId: null }, { providerMessageId: payload.MessageID }],
  };

  const result = await (async () => {
    if (payload.RecordType === 'Delivery') {
      return await prisma.recipientEmailDelivery.updateMany({
        where: {
          ...commonWhere,
          complainedAt: null,
          AND: [{ OR: [{ failedAt: null }, { failedAt: { lte: payload.DeliveredAt } }] }],
        },
        data: {
          status: EmailDeliveryStatus.DELIVERED,
          providerMessageId: payload.MessageID,
          deliveredAt: payload.DeliveredAt,
        },
      });
    }

    const reason = payload.Details?.trim() || payload.Description;

    if (payload.RecordType === 'SpamComplaint') {
      return await prisma.recipientEmailDelivery.updateMany({
        where: commonWhere,
        data: {
          status: EmailDeliveryStatus.COMPLAINED,
          providerMessageId: payload.MessageID,
          complainedAt: payload.BouncedAt,
          failureType: payload.Type,
          failureReason: reason,
        },
      });
    }

    return await prisma.recipientEmailDelivery.updateMany({
      where: {
        ...commonWhere,
        complainedAt: null,
        AND: [{ OR: [{ deliveredAt: null }, { deliveredAt: { lte: payload.BouncedAt } }] }],
      },
      data: {
        status: EmailDeliveryStatus.FAILED,
        providerMessageId: payload.MessageID,
        failedAt: payload.BouncedAt,
        failureType: payload.Type,
        failureReason: reason,
      },
    });
  })();

  return Response.json({ processed: result.count === 1 });
};
