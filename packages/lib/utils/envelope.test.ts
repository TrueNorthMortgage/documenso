import { DocumentStatus, EnvelopeType, RecipientRole, SendStatus, SigningStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { getEnvelopeItemPermissions } from './envelope';

const pendingEnvelope = {
  completedAt: null,
  correctionStartedAt: null,
  deletedAt: null,
  type: EnvelopeType.DOCUMENT,
  status: DocumentStatus.PENDING,
};

const pendingRecipient = {
  role: RecipientRole.SIGNER,
  signingStatus: SigningStatus.NOT_SIGNED,
  sendStatus: SendStatus.SENT,
};

describe('getEnvelopeItemPermissions', () => {
  it('prevents document changes before correction starts', () => {
    const permissions = getEnvelopeItemPermissions(pendingEnvelope, [pendingRecipient]);

    expect(permissions.canFileBeChanged).toBe(false);
    expect(permissions.canOrderBeChanged).toBe(false);
  });

  it('allows document changes during correction before a recipient completes', () => {
    const permissions = getEnvelopeItemPermissions({ ...pendingEnvelope, correctionStartedAt: new Date() }, [
      pendingRecipient,
    ]);

    expect(permissions.canFileBeChanged).toBe(true);
    expect(permissions.canOrderBeChanged).toBe(true);
  });

  it('prevents document changes after a recipient completes', () => {
    const permissions = getEnvelopeItemPermissions({ ...pendingEnvelope, correctionStartedAt: new Date() }, [
      { ...pendingRecipient, signingStatus: SigningStatus.SIGNED },
    ]);

    expect(permissions.canFileBeChanged).toBe(false);
    expect(permissions.canTitleBeChanged).toBe(false);
    expect(permissions.canOrderBeChanged).toBe(false);
  });
});
