import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock('@documenso/prisma', async () => {
  const { sql } = await import('kysely');
  const driver = new DummyDriver();
  vi.spyOn(driver, 'acquireConnection').mockResolvedValue({
    executeQuery: mocks.execute,
    async *streamQuery() {},
  });
  return {
    sql,
    kyselyPrisma: {
      $kysely: new Kysely({
        dialect: {
          createDriver: () => driver,
          createAdapter: () => new PostgresAdapter(),
          createIntrospector: (db) => new PostgresIntrospector(db),
          createQueryCompiler: () => new PostgresQueryCompiler(),
        },
      }),
    },
  };
});

import { findRankedTemplateIds } from './find-ranked-template-ids';

const options = { userId: 7, teamId: 12, visibility: ['EVERYONE'] as const, page: 1, perPage: 10 };
const run = (overrides = {}) =>
  findRankedTemplateIds({ ...options, visibility: [...options.visibility], ...overrides });
const queries = () => mocks.execute.mock.calls.map(([query]) => query as { sql: string; parameters: unknown[] });

beforeEach(() => {
  mocks.execute.mockReset().mockImplementation(async (query) => ({
    rows: query.sql.includes('left join') ? [{ id: 'envelope_a', isFavorite: true }] : [{ count: '31' }],
  }));
});

describe('template ranking query', () => {
  it('ranks before pagination and returns only the requested page plus its count', async () => {
    expect(await run({ page: 3, perPage: 5 })).toEqual({ rows: [{ id: 'envelope_a', isFavorite: true }], count: 31 });
    const [rank, count] = queries();
    expect(rank.sql).toContain('order by ("favorite"."userId" IS NOT NULL) desc, CASE WHEN');
    expect(rank.sql).toContain(
      'THEN 0 ELSE COALESCE("usage"."usageCount", 0) END desc, lower("template"."title") asc, "template"."id" asc',
    );
    expect(rank.parameters.slice(-2)).toEqual([5, 10]);
    expect(count.sql).not.toContain('join');
    expect(count.sql).not.toContain('limit');
  });

  it('limits usage and favorites to the current user and counts only documents created from templates', async () => {
    await run();
    const [rank] = queries();
    expect(rank.sql).toContain('"favorite"."userId" =');
    expect(rank.sql).toContain('"userId" =');
    expect(rank.sql).toContain('"type" = \'DOCUMENT\'');
    expect(rank.sql).toContain('"source" = \'TEMPLATE\'');
    expect(rank.sql).toContain('"templateId" is not null');
    expect(rank.parameters.filter((value) => value === 7)).toHaveLength(3);
  });

  it('preserves team visibility and root folder filters', async () => {
    await run();
    for (const query of queries()) {
      expect(query.sql).toContain('"template"."teamId" =');
      expect(query.sql).toContain('("template"."visibility" in');
      expect(query.sql).toContain('or "template"."userId" =');
      expect(query.sql).toContain('"template"."folderId" is null');
    }
  });

  it('supports folder, type and literal title filtering without SQL interpolation', async () => {
    await run({ folderId: 'folder_x', type: 'PRIVATE', query: "  50%_O'Reilly  " });
    for (const query of queries()) {
      expect(query.sql).not.toContain("O'Reilly");
      expect(query.parameters).toContain("%50\\%\\_O'Reilly%");
      expect(query.parameters).toContain('folder_x');
      expect(query.sql).toContain('"template"."templateType" = \'PRIVATE\'');
    }
  });

  it('scopes organisation templates to the same organisation and permitted visibility', async () => {
    await run({ organisationId: 'org_x', type: 'ORGANISATION', includeAllFolders: true });
    for (const query of queries()) {
      expect(query.sql).toContain('select "id" from "Team" where "organisationId" =');
      expect(query.parameters).toContain('org_x');
      expect(query.sql).toContain('"template"."templateType" = \'ORGANISATION\'');
      expect(query.sql).not.toContain('"template"."folderId"');
      expect(query.sql).not.toContain('or "template"."userId"');
    }
  });
});
