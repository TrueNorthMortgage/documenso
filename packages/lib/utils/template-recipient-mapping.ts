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

    if (recipientsForRole.length > templateRecipientsForRole.length) {
      return null;
    }

    recipientsForRole.forEach((recipient, index) => {
      const templateRecipient = templateRecipientsForRole[index];

      recipientMap.set(templateRecipient.id, recipient.id);
    });

    unmappedTemplateRecipientIds.push(
      ...templateRecipientsForRole.slice(recipientsForRole.length).map((recipient) => recipient.id),
    );
  }

  return {
    recipientMap,
    unmappedTemplateRecipientIds,
  };
};
