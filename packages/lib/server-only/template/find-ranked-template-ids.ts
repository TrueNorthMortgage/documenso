import { kyselyPrisma, sql } from '@documenso/prisma';
import { DocumentSource, type DocumentVisibility, EnvelopeType, type TemplateType } from '@prisma/client';

export type FindRankedTemplateIdsOptions = {
  userId: number;
  teamId: number;
  organisationId?: string;
  visibility: DocumentVisibility[];
  type?: TemplateType;
  folderId?: string;
  includeAllFolders?: boolean;
  query?: string;
  page: number;
  perPage: number;
};

export const findRankedTemplateIds = async ({
  userId,
  teamId,
  organisationId,
  visibility,
  type,
  folderId,
  includeAllFolders,
  query,
  page,
  perPage,
}: FindRankedTemplateIdsOptions) => {
  let templates = kyselyPrisma.$kysely
    .selectFrom('Envelope as template')
    .where('template.type', '=', sql.lit(EnvelopeType.TEMPLATE));

  if (organisationId) {
    templates = templates
      .where(
        'template.teamId',
        'in',
        kyselyPrisma.$kysely.selectFrom('Team').select('id').where('organisationId', '=', organisationId),
      )
      .where(
        'template.visibility',
        'in',
        visibility.map((value) => sql.lit(value)),
      );
  } else {
    templates = templates.where('template.teamId', '=', teamId).where(({ or, eb }) =>
      or([
        eb(
          'template.visibility',
          'in',
          visibility.map((value) => sql.lit(value)),
        ),
        eb('template.userId', '=', userId),
      ]),
    );
  }

  if (type) {
    templates = templates.where('template.templateType', '=', sql.lit(type));
  }

  if (!includeAllFolders) {
    templates = folderId
      ? templates.where('template.folderId', '=', folderId)
      : templates.where('template.folderId', 'is', null);
  }

  if (query?.trim()) {
    // Match Prisma's literal substring search, including titles containing % or _.
    const pattern = query.trim().replace(/[\\%_]/g, '\\$&');
    templates = templates.where('template.title', 'ilike', `%${pattern}%`);
  }

  const usage = kyselyPrisma.$kysely
    .selectFrom('Envelope')
    .select(['templateId', ({ fn }) => fn.countAll<number>().as('usageCount')])
    .where('userId', '=', userId)
    .where('type', '=', sql.lit(EnvelopeType.DOCUMENT))
    .where('source', '=', sql.lit(DocumentSource.TEMPLATE))
    .where('templateId', 'is not', null)
    .groupBy('templateId');

  const [rows, count] = await Promise.all([
    templates
      .leftJoin('TemplateFavorite as favorite', (join) =>
        join.onRef('favorite.envelopeId', '=', 'template.id').on('favorite.userId', '=', userId),
      )
      .leftJoin(usage.as('usage'), (join) =>
        join.on(sql<string>`'template_' || ${sql.ref('usage.templateId')}::text`, '=', sql.ref('template.secondaryId')),
      )
      .select(['template.id', sql<boolean>`(${sql.ref('favorite.userId')} IS NOT NULL)`.as('isFavorite')])
      .orderBy(sql`(${sql.ref('favorite.userId')} IS NOT NULL)`, 'desc')
      // Favorites are alphabetical; usage ranks the remaining templates.
      .orderBy(
        sql`CASE WHEN ${sql.ref('favorite.userId')} IS NOT NULL THEN 0 ELSE COALESCE(${sql.ref('usage.usageCount')}, 0) END`,
        'desc',
      )
      .orderBy(sql`lower(${sql.ref('template.title')})`, 'asc')
      .orderBy('template.id', 'asc')
      .offset(Math.max(page - 1, 0) * perPage)
      .limit(perPage)
      .execute(),
    templates.select(({ fn }) => fn.countAll<number>().as('count')).executeTakeFirstOrThrow(),
  ]);

  return { rows, count: Number(count.count) };
};
