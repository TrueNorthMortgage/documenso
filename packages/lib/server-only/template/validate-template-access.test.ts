import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { EnvelopeType, TeamMemberRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { assertCanManageTemplate, assertCanManageTemplates } from './validate-template-access';

describe('assertCanManageTemplate', () => {
  it("rejects a member modifying another user's template", () => {
    expect(() =>
      assertCanManageTemplate({
        envelopeType: EnvelopeType.TEMPLATE,
        templateOwnerId: 1,
        currentTeamRole: TeamMemberRole.MEMBER,
        userId: 2,
      }),
    ).toThrowError(AppError);

    try {
      assertCanManageTemplate({
        envelopeType: EnvelopeType.TEMPLATE,
        templateOwnerId: 1,
        currentTeamRole: TeamMemberRole.MEMBER,
        userId: 2,
      });
    } catch (error) {
      expect(error).toMatchObject({ code: AppErrorCode.FORBIDDEN });
    }
  });

  it('allows a member to modify their own template', () => {
    expect(() =>
      assertCanManageTemplate({
        envelopeType: EnvelopeType.TEMPLATE,
        templateOwnerId: 1,
        currentTeamRole: TeamMemberRole.MEMBER,
        userId: 1,
      }),
    ).not.toThrow();
  });

  it("allows managers and admins to modify another user's template", () => {
    for (const currentTeamRole of [TeamMemberRole.MANAGER, TeamMemberRole.ADMIN]) {
      expect(() =>
        assertCanManageTemplate({
          envelopeType: EnvelopeType.TEMPLATE,
          templateOwnerId: 1,
          currentTeamRole,
          userId: 2,
        }),
      ).not.toThrow();
    }
  });

  it('does not restrict document access', () => {
    expect(() =>
      assertCanManageTemplate({
        envelopeType: EnvelopeType.DOCUMENT,
        templateOwnerId: 1,
        currentTeamRole: TeamMemberRole.MEMBER,
        userId: 2,
      }),
    ).not.toThrow();
  });

  it('rejects a batch containing a template owned by another member', () => {
    expect(() =>
      assertCanManageTemplates({
        templateOwnerIds: [1, 2],
        currentTeamRole: TeamMemberRole.MEMBER,
        userId: 1,
      }),
    ).toThrowError(AppError);
  });

  it('allows managers to modify a batch of templates', () => {
    expect(() =>
      assertCanManageTemplates({
        templateOwnerIds: [1, 2],
        currentTeamRole: TeamMemberRole.MANAGER,
        userId: 3,
      }),
    ).not.toThrow();
  });
});
