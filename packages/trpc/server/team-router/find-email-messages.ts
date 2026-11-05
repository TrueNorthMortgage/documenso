import { getTeamById } from '@documenso/lib/server-only/team/get-team';
import { prisma } from '@documenso/prisma';

import { authenticatedProcedure } from '../trpc';
import { ZFindEmailMessagesRequestSchema } from './find-email-messages.types';

export const findEmailMessagesRoute = authenticatedProcedure
  .input(ZFindEmailMessagesRequestSchema)
  .query(async ({ input, ctx }) => {
    const { teamId, query, teamOnly } = input;
    const userId = ctx.user.id;

    await getTeamById({ teamId, userId });

    const search = query
      ? {
          OR: [
            { name: { contains: query, mode: 'insensitive' as const } },
            { subject: { contains: query, mode: 'insensitive' as const } },
            { message: { contains: query, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const favorite = { favorites: { some: { userId } } };
    const select = {
      id: true,
      name: true,
      subject: true,
      message: true,
      lastSentAt: true,
      favorites: { where: { userId }, select: { userId: true } },
    } as const;

    const [favorites, templates, recent] = await Promise.all([
      prisma.emailMessage.findMany({
        where: {
          teamId,
          AND: [search, favorite, { OR: teamOnly ? [{ ownerId: null }] : [{ ownerId: null }, { ownerId: userId }] }],
        },
        select,
        orderBy: [{ name: 'asc' }, { lastSentAt: 'desc' }, { id: 'asc' }],
      }),
      prisma.emailMessage.findMany({
        where: { teamId, ownerId: null, ...search, NOT: favorite },
        select,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      teamOnly
        ? []
        : prisma.emailMessage.findMany({
            where: { teamId, ownerId: userId, ...search, NOT: favorite },
            select,
            orderBy: [{ lastSentAt: 'desc' }, { id: 'asc' }],
            take: query ? 50 : 5,
          }),
    ]);

    return [...favorites, ...templates, ...recent].map(({ favorites, ...item }) => ({
      ...item,
      isFavorite: favorites.length > 0,
    }));
  });
