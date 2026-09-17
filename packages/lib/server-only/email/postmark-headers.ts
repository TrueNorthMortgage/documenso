export type PostmarkEnvelopeHeadersOptions = {
  deliveryId: string;
  envelopeId: string;
  recipientId: number;
};

/**
 * Postmark exposes X-PM-Metadata-* headers on email webhooks.
 *
 * These identifiers let us associate a bounce with one exact envelope recipient,
 * even when an email address is used on more than one envelope.
 */
export const getPostmarkEnvelopeHeaders = ({
  deliveryId,
  envelopeId,
  recipientId,
}: PostmarkEnvelopeHeadersOptions) => ({
  'X-PM-Metadata-delivery-id': deliveryId,
  'X-PM-Metadata-envelope-id': envelopeId,
  'X-PM-Metadata-recipient-id': String(recipientId),
});
