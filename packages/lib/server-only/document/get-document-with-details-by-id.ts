import { prisma } from '@documenso/prisma';
import { EnvelopeType } from '@prisma/client';

import { type EnvelopeIdOptions, mapSecondaryIdToDocumentId } from '../../utils/envelope';
import { maskRecipientTokensForDocument } from '../../utils/mask-recipient-tokens-for-document';
import { getEnvelopeById } from '../envelope/get-envelope-by-id';
import { getTeamById } from '../team/get-team';

export type GetDocumentWithDetailsByIdOptions = {
  id: EnvelopeIdOptions;
  userId: number;
  teamId: number;
};

export const getDocumentWithDetailsById = async ({ id, userId, teamId }: GetDocumentWithDetailsByIdOptions) => {
  const envelope = await getEnvelopeById({
    id,
    type: EnvelopeType.DOCUMENT,
    userId,
    teamId,
  });

  const [team, user] = await Promise.all([
    getTeamById({ userId, teamId }),
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true },
    }),
  ]);

  const maskedEnvelope = maskRecipientTokensForDocument({
    document: envelope,
    user,
    currentTeamRole: team.currentTeamRole,
  });

  const legacyDocumentId = mapSecondaryIdToDocumentId(maskedEnvelope.secondaryId);

  const firstDocumentData = maskedEnvelope.envelopeItems[0].documentData;

  if (!firstDocumentData) {
    throw new Error('Document data not found');
  }

  return {
    ...maskedEnvelope,
    envelopeId: maskedEnvelope.id,
    internalVersion: maskedEnvelope.internalVersion,
    documentData: {
      ...firstDocumentData,
      envelopeItemId: maskedEnvelope.envelopeItems[0].id,
    },
    id: legacyDocumentId,
    fields: maskedEnvelope.fields.map((field) => ({
      ...field,
      documentId: legacyDocumentId,
      templateId: null,
    })),
    user: {
      id: maskedEnvelope.userId,
      name: maskedEnvelope.user.name,
      email: maskedEnvelope.user.email,
    },
    team: {
      id: maskedEnvelope.teamId,
      url: maskedEnvelope.team.url,
    },
    recipients: maskedEnvelope.recipients.map((recipient) => ({
      ...recipient,
      documentId: legacyDocumentId,
      templateId: null,
    })),
    documentDataId: firstDocumentData.id,
    documentMeta: {
      ...maskedEnvelope.documentMeta,
      documentId: legacyDocumentId,
      password: null,
    },
    envelopeItems: maskedEnvelope.envelopeItems.map((envelopeItem) => ({
      ...envelopeItem,
    })),
  };
};
