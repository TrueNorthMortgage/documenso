import { DocumentVisibility, TeamMemberRole } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { assertCanUpdateDocumentVisibility } from './validate-document-visibility';

describe('document visibility authorization', () => {
  it.each([true, false])('rejects a member making their document visible to everyone (owner=%s)', (isOwner) => {
    const changeVisibility = () =>
      assertCanUpdateDocumentVisibility({
        role: TeamMemberRole.MEMBER,
        currentVisibility: DocumentVisibility.MANAGER_AND_ABOVE,
        newVisibility: DocumentVisibility.EVERYONE,
        isOwner,
      });

    expect(changeVisibility).toThrow(AppError);
    try {
      changeVisibility();
    } catch (error) {
      expect(error).toMatchObject({ code: AppErrorCode.FORBIDDEN });
      expect(AppError.toRestAPIError(error).status).toBe(403);
    }
  });

  it.each(
    Object.values(DocumentVisibility),
  )('allows members to save other settings on their %s document', (visibility) => {
    for (const newVisibility of [undefined, visibility]) {
      expect(() =>
        assertCanUpdateDocumentVisibility({
          role: TeamMemberRole.MEMBER,
          currentVisibility: visibility,
          newVisibility,
          isOwner: true,
        }),
      ).not.toThrow();
    }
  });

  it.each([
    TeamMemberRole.ADMIN,
    TeamMemberRole.MANAGER,
  ])('allows %s to change sharing on an accessible document', (role) => {
    expect(() =>
      assertCanUpdateDocumentVisibility({
        role,
        currentVisibility: DocumentVisibility.EVERYONE,
        newVisibility: DocumentVisibility.MANAGER_AND_ABOVE,
        isOwner: false,
      }),
    ).not.toThrow();
  });

  it('prevents a non-owner manager from selecting admin-only visibility', () => {
    expect(() =>
      assertCanUpdateDocumentVisibility({
        role: TeamMemberRole.MANAGER,
        currentVisibility: DocumentVisibility.EVERYONE,
        newVisibility: DocumentVisibility.ADMIN,
        isOwner: false,
      }),
    ).toThrow(AppError);
  });
});
