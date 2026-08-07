import type { RecipientRole } from '@prisma/client';
import type { TRecipientAccessAuthTypes, TRecipientActionAuthTypes } from '../../types/document-auth';
import type { TEnvelopeFieldAndMeta } from '../../types/field-meta';

type EnvelopeItem = {
  title: string;
  documentDataId: string;
};

type Recipient = {
  email: string;
  name: string;
  role: RecipientRole;
  signingOrder?: number;
  accessAuth?: TRecipientAccessAuthTypes[];
  actionAuth?: TRecipientActionAuthTypes[];
  fields?: Array<
    TEnvelopeFieldAndMeta & {
      identifier?: string | number;
      page: number;
      positionX: number;
      positionY: number;
      width: number;
      height: number;
    }
  >;
};

export const mapEnvelopeRecipients = (recipients: Recipient[] | undefined, envelopeItems: EnvelopeItem[]) =>
  recipients?.map((recipient) => ({
    email: recipient.email,
    name: recipient.name,
    role: recipient.role,
    signingOrder: recipient.signingOrder,
    accessAuth: recipient.accessAuth,
    actionAuth: recipient.actionAuth,
    fields: recipient.fields?.map((field) => {
      let documentDataId: string | undefined;

      if (typeof field.identifier === 'string') {
        documentDataId = envelopeItems.find((item) => item.title === field.identifier)?.documentDataId;
      }

      if (typeof field.identifier === 'number') {
        documentDataId = envelopeItems.at(field.identifier)?.documentDataId;
      }

      if (field.identifier === undefined) {
        documentDataId = envelopeItems.at(0)?.documentDataId;
      }

      if (!documentDataId) {
        throw new Error('Document data not found');
      }

      return {
        ...field,
        documentDataId,
      };
    }),
  }));
