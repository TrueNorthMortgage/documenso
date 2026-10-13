import type { DocumentVisibility, TeamMemberRole } from '@prisma/client';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { canAccessTeamDocument, canUpdateDocumentVisibility } from '../../utils/teams';

export const assertCanUpdateDocumentVisibility = ({
  role,
  currentVisibility,
  newVisibility,
  isOwner,
}: {
  role: TeamMemberRole;
  currentVisibility: DocumentVisibility;
  newVisibility?: DocumentVisibility;
  isOwner: boolean;
}) => {
  // Settings forms can resend the existing value when updating unrelated fields.
  if (newVisibility === undefined || newVisibility === currentVisibility) {
    return;
  }

  if (
    !canUpdateDocumentVisibility(role, currentVisibility, isOwner) ||
    (!isOwner && !canAccessTeamDocument(role, newVisibility))
  ) {
    throw new AppError(AppErrorCode.FORBIDDEN, {
      message: 'You do not have permission to update the envelope visibility',
    });
  }
};
