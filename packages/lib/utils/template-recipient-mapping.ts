import type { Recipient } from '@prisma/client';
import { DocumentSigningOrder } from '@prisma/client';

export type TemplateRecipientReference = Pick<Recipient, 'id' | 'role'>;

export type TemplateRecipientMapping = {
  recipientMap: Map<number, number>;
  unmappedTemplateRecipientIds: number[];
};

export const shouldMatchTemplateRecipientsBySigningOrder = ({
  templateSigningOrder,
  envelopeSigningOrder,
}: {
  templateSigningOrder?: DocumentSigningOrder | null;
  envelopeSigningOrder?: DocumentSigningOrder | null;
}) =>
  templateSigningOrder === DocumentSigningOrder.SEQUENTIAL && envelopeSigningOrder === DocumentSigningOrder.SEQUENTIAL;

export const mapTemplateRecipientsByRole = <T extends TemplateRecipientReference>({
  templateRecipients,
  recipients,
}: {
  templateRecipients: TemplateRecipientReference[];
  recipients: T[];
}): TemplateRecipientMapping | null => {
  const recipientMap = new Map<number, number>();
  const unmappedTemplateRecipientIds: number[] = [];
  const roles = new Set(templateRecipients.map((recipient) => recipient.role));

  for (const role of roles) {
    const templateRecipientsForRole = templateRecipients
      .filter((recipient) => recipient.role === role)
      .sort((left, right) => left.id - right.id);
    const recipientsForRole = recipients
      .filter((recipient) => recipient.role === role)
      .sort((left, right) => left.id - right.id);

    templateRecipientsForRole.forEach((templateRecipient, index) => {
      const recipient = recipientsForRole[index];

      if (!recipient) {
        unmappedTemplateRecipientIds.push(templateRecipient.id);
        return;
      }

      recipientMap.set(templateRecipient.id, recipient.id);
    });

    // Additional envelope recipients are intentionally left unmapped. Applying a template
    // should not require the document owner to remove recipients that do not have fields in it.
  }

  return {
    recipientMap,
    unmappedTemplateRecipientIds,
  };
};
