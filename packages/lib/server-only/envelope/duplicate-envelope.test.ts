import { AppErrorCode } from '@documenso/lib/errors/app-error';
import { EnvelopeType, TeamMemberRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    envelope: {
      findFirst: vi.fn(),
    },
  },
  getEnvelopeWhereInput: vi.fn(),
  getOrganisationTemplateWhereInput: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('./get-envelope-by-id', () => ({ getEnvelopeWhereInput: mocks.getEnvelopeWhereInput }));
vi.mock('../template/get-organisation-template-by-id', () => ({
  getOrganisationTemplateWhereInput: mocks.getOrganisationTemplateWhereInput,
}));

import { duplicateEnvelope } from './duplicate-envelope';

describe('duplicateEnvelope', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getEnvelopeWhereInput.mockResolvedValue({
      envelopeWhereInput: { id: 'template_1' },
      team: {
        currentTeamRole: TeamMemberRole.MEMBER,
        organisationId: 'organisation_1',
      },
    });
    mocks.getOrganisationTemplateWhereInput.mockReturnValue({ id: 'template_1' });
  });

  it('falls back to organisation template access for a template from another team', async () => {
    mocks.prisma.envelope.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ type: EnvelopeType.TEMPLATE });

    await expect(
      duplicateEnvelope({
        id: { type: 'envelopeId', id: 'template_1' },
        userId: 2,
        teamId: 1,
        overrides: { duplicateAsTemplate: true },
      }),
    ).rejects.toMatchObject({ code: AppErrorCode.INVALID_REQUEST });

    expect(mocks.getOrganisationTemplateWhereInput).toHaveBeenCalledWith({
      id: { type: 'envelopeId', id: 'template_1' },
      organisationId: 'organisation_1',
      teamRole: TeamMemberRole.MEMBER,
    });
    expect(mocks.prisma.envelope.findFirst).toHaveBeenCalledTimes(2);
  });
});
