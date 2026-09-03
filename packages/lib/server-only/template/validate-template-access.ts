import { EnvelopeType, type TeamMemberRole } from '@prisma/client';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { canManageTemplate } from '../../utils/teams';

export const assertCanManageTemplate = ({
  envelopeType,
  templateOwnerId,
  currentTeamRole,
  userId,
}: {
  envelopeType: EnvelopeType;
  templateOwnerId: number;
  currentTeamRole: TeamMemberRole;
  userId: number;
}) => {
  if (envelopeType === EnvelopeType.TEMPLATE && !canManageTemplate({ userId, templateOwnerId, currentTeamRole })) {
    throw new AppError(AppErrorCode.FORBIDDEN, {
      message: 'Only the template owner or a manager can modify this template',
      userMessage: 'Only the template owner or a manager can modify this template.',
    });
  }
};

export const assertCanManageTemplates = ({
  templateOwnerIds,
  currentTeamRole,
  userId,
}: {
  templateOwnerIds: number[];
  currentTeamRole: TeamMemberRole;
  userId: number;
}) => {
  for (const templateOwnerId of templateOwnerIds) {
    assertCanManageTemplate({
      envelopeType: EnvelopeType.TEMPLATE,
      templateOwnerId,
      currentTeamRole,
      userId,
    });
  }
};
