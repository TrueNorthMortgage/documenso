import { createHash } from 'node:crypto';

import { getTeamById } from '@documenso/lib/server-only/team/get-team';
import { prisma } from '@documenso/prisma';

import { authenticatedProcedure } from '../trpc';
import { ZCreatePersonalEmailTemplateRequestSchema } from './create-personal-email-template.types';

export const createPersonalEmailTemplateRoute = authenticatedProcedure
  .input(ZCreatePersonalEmailTemplateRequestSchema)
  .mutation(async ({ input, ctx }) => {
    const { teamId, subject, message } = input;
    const ownerId = ctx.user.id;

    await getTeamById({ teamId, userId: ownerId });

    const id = createHash('sha256')
      .update(JSON.stringify(['personal-template', teamId, ownerId, subject, message]))
      .digest('hex');

    await prisma.emailMessage.createMany({
      data: { id, teamId, ownerId, subject, message },
      skipDuplicates: true,
    });
  });
