import { DocumentStatus, type Envelope, EnvelopeType } from '@prisma/client';

type ReassignmentCandidate = Pick<
  Envelope,
  'id' | 'type' | 'teamId' | 'status' | 'deletedAt' | 'completedAt' | 'userId'
>;

export const isEnvelopeReassignable = (document: Pick<Envelope, 'type' | 'status' | 'deletedAt' | 'completedAt'>) => {
  const supportedStatuses: DocumentStatus[] = [DocumentStatus.DRAFT, DocumentStatus.PENDING, DocumentStatus.COMPLETED];
  return (
    document.type === EnvelopeType.DOCUMENT &&
    !document.deletedAt &&
    supportedStatuses.includes(document.status) &&
    (document.status === DocumentStatus.COMPLETED || !document.completedAt)
  );
};

export const getEnvelopeReassignmentSelection = <T extends ReassignmentCandidate>(
  documents: T[],
  teamId: number,
  newOwnerId: number,
) => {
  const eligible: T[] = [];
  const skipped: T[] = [];
  for (const document of documents) {
    if (isEnvelopeReassignable(document) && document.teamId === teamId && document.userId !== newOwnerId) {
      eligible.push(document);
    } else {
      skipped.push(document);
    }
  }
  return { eligible, skipped };
};
