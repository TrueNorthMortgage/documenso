import { DocumentVisibility, TeamMemberRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { canUpdateTeamDocumentVisibility } from './teams';

describe('canUpdateTeamDocumentVisibility', () => {
  it('allows members to update manager-and-above visibility', () => {
    expect(canUpdateTeamDocumentVisibility(TeamMemberRole.MEMBER, DocumentVisibility.MANAGER_AND_ABOVE)).toBe(true);
  });

  it('preserves the existing role restrictions for other visibility levels', () => {
    expect(canUpdateTeamDocumentVisibility(TeamMemberRole.MEMBER, DocumentVisibility.EVERYONE)).toBe(false);
    expect(canUpdateTeamDocumentVisibility(TeamMemberRole.MEMBER, DocumentVisibility.ADMIN)).toBe(false);
    expect(canUpdateTeamDocumentVisibility(TeamMemberRole.MANAGER, DocumentVisibility.ADMIN)).toBe(false);
    expect(canUpdateTeamDocumentVisibility(TeamMemberRole.ADMIN, DocumentVisibility.ADMIN)).toBe(true);
  });
});
