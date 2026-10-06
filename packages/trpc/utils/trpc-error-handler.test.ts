import { AppError, AppErrorCode, genericErrorCodeToTrpcErrorCodeMap } from '@documenso/lib/errors/app-error';
import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { handleTrpcRouterError } from './trpc-error-handler';

const log = vi.hoisted(() => ({ child: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock('@documenso/lib/utils/logger', () => ({ logger: log }));

beforeEach(() => {
  vi.clearAllMocks();
  log.child.mockReturnValue(log);
});

describe('validation error logging', () => {
  it.each([
    'A field cannot be both read-only and required',
    'A read-only field must have text',
    'Recipient 1 has unsigned fields',
  ])('keeps %s as a handled client error', (message) => {
    const cause = new AppError(AppErrorCode.INVALID_REQUEST, { message });

    handleTrpcRouterError(
      { error: new TRPCError({ code: 'INTERNAL_SERVER_ERROR', cause }), path: 'envelope.field.set', ctx: undefined },
      'trpc',
    );

    expect(genericErrorCodeToTrpcErrorCodeMap[cause.code].status).toBe(400);
    expect(log.child).toHaveBeenCalledWith(expect.objectContaining({ appError: { code: 'INVALID_REQUEST', message } }));
    expect(log.info).toHaveBeenCalledWith('TRPC_ERROR_HANDLER');
    expect(log.error).not.toHaveBeenCalled();
  });

  it('still reports unexpected failures as server errors', () => {
    const error = new TRPCError({ code: 'INTERNAL_SERVER_ERROR', cause: new Error('Database unavailable') });

    handleTrpcRouterError({ error, path: 'envelope.field.set', ctx: undefined }, 'trpc');

    expect(log.error).toHaveBeenCalledWith(error);
    expect(log.info).not.toHaveBeenCalled();
  });
});
