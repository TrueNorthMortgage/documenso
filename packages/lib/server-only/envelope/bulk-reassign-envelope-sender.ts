import { AppError } from '../../errors/app-error';

import { type ReassignEnvelopeSenderOptions, reassignEnvelopeSender } from './reassign-envelope-sender';

type BulkReassignEnvelopeSenderOptions = Omit<ReassignEnvelopeSenderOptions, 'envelopeId' | 'expectedOwnerId'> & {
  envelopes: { envelopeId: string; expectedOwnerId: number }[];
};

export const bulkReassignEnvelopeSender = async ({ envelopes, ...options }: BulkReassignEnvelopeSenderOptions) => {
  const succeededIds: string[] = [];
  const failed: { envelopeId: string; message: string }[] = [];

  // Keep each transfer atomic while allowing the remaining envelopes to proceed after a failure.
  for (const envelope of envelopes) {
    try {
      await reassignEnvelopeSender({ ...options, ...envelope });
      succeededIds.push(envelope.envelopeId);
    } catch (error) {
      failed.push({
        envelopeId: envelope.envelopeId,
        message: (error instanceof AppError && error.userMessage) || 'This envelope could not be reassigned.',
      });
    }
  }

  return { succeededIds, failed };
};
