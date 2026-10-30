import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { TRPCError } from '@trpc/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@documenso/lib/server-only/public-api/get-api-token-by-token', () => ({ getApiTokenByToken: vi.fn() }));
vi.mock('@documenso/lib/utils/is-admin', () => ({ isAdmin: vi.fn() }));

import { router } from './trpc';

const formatter = router({})._def._config.errorFormatter;
const format = (error: TRPCError) =>
  formatter({
    error,
    type: 'mutation',
    path: 'folder.createFolder',
    input: undefined,
    ctx: undefined,
    shape: {
      code: -32603,
      message: error.message,
      data: {
        code: 'INTERNAL_SERVER_ERROR',
        httpStatus: 500,
        path: 'folder.createFolder',
        stack: 'internal /app/server.ts:10',
      },
    },
  });

describe('client error formatting', () => {
  it('hides unexpected database details and stacks while preserving the original diagnostic error', () => {
    const cause = new Error('PrismaClient error: SQLSTATE 22021 /app/internal/database.ts');
    const result = format(new TRPCError({ code: 'INTERNAL_SERVER_ERROR', cause }));

    expect(result.message).toBe('An unexpected error occurred. Please try again.');
    expect(result.data).not.toHaveProperty('stack');
    expect(JSON.stringify(result)).not.toMatch(/Prisma|SQLSTATE|\/app\//);
    expect(cause.message).toContain('SQLSTATE 22021');
    expect(result.data.httpStatus).toBe(500);
  });

  it('sanitizes internal AppError messages in both response locations', () => {
    const result = format(
      new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        cause: new AppError(AppErrorCode.UNKNOWN_ERROR, { message: 'Private database connection failed' }),
      }),
    );

    expect(result.message).toBe('An unexpected error occurred. Please try again.');
    expect(result.data.appError).toMatchObject({
      code: AppErrorCode.UNKNOWN_ERROR,
      message: result.message,
      userMessage: result.message,
    });
    expect(JSON.stringify(result)).not.toContain('Private database');
  });

  it('preserves an explicitly safe user message without exposing its internal counterpart', () => {
    const result = format(
      new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        cause: new AppError(AppErrorCode.UNKNOWN_ERROR, {
          message: 'Private service failure',
          userMessage: 'The file could not be processed.',
        }),
      }),
    );

    expect(result.message).toBe('The file could not be processed.');
    expect(JSON.stringify(result)).not.toContain('Private service failure');
  });

  it('keeps handled validation errors as client errors rather than masking them as server failures', () => {
    const result = format(
      new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        cause: new AppError(AppErrorCode.INVALID_BODY, {
          message: 'Invalid folder name',
          userMessage: 'Folder name cannot contain control characters',
        }),
      }),
    );

    expect(result.data.httpStatus).toBe(400);
    expect(result.data.appError).toMatchObject({
      code: AppErrorCode.INVALID_BODY,
      userMessage: 'Folder name cannot contain control characters',
    });
    expect(result.message).toBe('Invalid folder name');
    expect(result.data).not.toHaveProperty('stack');
  });
});
