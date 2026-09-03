import { DocumentVisibility, TeamMemberRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { canManageFolder, canManageTemplate, canUpdateTeamDocumentVisibility } from './teams';

describe('canUpdateTeamDocumentVisibility', () => {
  it('allows members to update manager-and-above visibility', () => {
    expect(canUpdateTeamDocumentVisibility(TeamMemberRole.MEMBER, DocumentVisibility.MANAGER_AND_ABOVE)).toBe(true);
  });

  it('allows owners to update visibility to any level', () => {
    expect(canUpdateTeamDocumentVisibility(TeamMemberRole.MEMBER, DocumentVisibility.EVERYONE, true)).toBe(true);
    expect(canUpdateTeamDocumentVisibility(TeamMemberRole.MEMBER, DocumentVisibility.MANAGER_AND_ABOVE, true)).toBe(
      true,
    );
    expect(canUpdateTeamDocumentVisibility(TeamMemberRole.MEMBER, DocumentVisibility.ADMIN, true)).toBe(true);
  });

  it('preserves the existing role restrictions for other visibility levels', () => {
    expect(canUpdateTeamDocumentVisibility(TeamMemberRole.MEMBER, DocumentVisibility.EVERYONE)).toBe(false);
    expect(canUpdateTeamDocumentVisibility(TeamMemberRole.MEMBER, DocumentVisibility.ADMIN)).toBe(false);
    expect(canUpdateTeamDocumentVisibility(TeamMemberRole.MANAGER, DocumentVisibility.ADMIN)).toBe(false);
    expect(canUpdateTeamDocumentVisibility(TeamMemberRole.ADMIN, DocumentVisibility.ADMIN)).toBe(true);
  });
});

describe('canManageTemplate', () => {
  it('allows the template owner to manage a template', () => {
    expect(
      canManageTemplate({
        userId: 1,
        templateOwnerId: 1,
        currentTeamRole: TeamMemberRole.MEMBER,
      }),
    ).toBe(true);
  });

  it('allows managers and admins to manage shared templates', () => {
    expect(
      canManageTemplate({
        userId: 2,
        templateOwnerId: 1,
        currentTeamRole: TeamMemberRole.MANAGER,
      }),
    ).toBe(true);
    expect(
      canManageTemplate({
        userId: 3,
        templateOwnerId: 1,
        currentTeamRole: TeamMemberRole.ADMIN,
      }),
    ).toBe(true);
  });

  it('does not allow members to manage templates owned by someone else', () => {
    expect(
      canManageTemplate({
        userId: 2,
        templateOwnerId: 1,
        currentTeamRole: TeamMemberRole.MEMBER,
      }),
    ).toBe(false);
  });
});

describe('canManageFolder', () => {
  it('allows the folder owner to manage a folder', () => {
    expect(
      canManageFolder({
        userId: 1,
        folderOwnerId: 1,
        currentTeamRole: TeamMemberRole.MEMBER,
      }),
    ).toBe(true);
  });

  it('allows managers and admins to manage folders owned by someone else', () => {
    expect(
      canManageFolder({
        userId: 2,
        folderOwnerId: 1,
        currentTeamRole: TeamMemberRole.MANAGER,
      }),
    ).toBe(true);
    expect(
      canManageFolder({
        userId: 3,
        folderOwnerId: 1,
        currentTeamRole: TeamMemberRole.ADMIN,
      }),
    ).toBe(true);
  });

  it('does not allow members to manage folders owned by someone else', () => {
    expect(
      canManageFolder({
        userId: 2,
        folderOwnerId: 1,
        currentTeamRole: TeamMemberRole.MEMBER,
      }),
    ).toBe(false);
  });
});
