import { AppError } from '@documenso/lib/errors/app-error';
import { prisma } from '@documenso/prisma';
import type { Session } from '@prisma/client';
import type { Context, Next } from 'hono';
import { tryGetContext } from 'hono/context-storage';

import { AUTH_SESSION_IDLE_TIMEOUT } from '../../config';
import { AuthenticationErrorCode } from '../errors/error-codes';
import type { SessionValidationResult } from '../session/session';
import { validateSessionToken } from '../session/session';
import { getSessionCookie, sessionCookieName, setSessionCookie } from '../session/session-cookies';

type RequestSession = {
  token: string | null;
  result: SessionValidationResult;
};

const requestSessions = new WeakMap<Context, Promise<RequestSession>>();

export const sessionRenewalMiddleware = async (c: Context, next: Next) => {
  await next();

  const session = await requestSessions.get(c)?.catch(() => undefined);

  if (!session?.token || !session.result.isAuthenticated) {
    return;
  }

  // A route that replaced or cleared the session cookie takes precedence.
  const hasSessionCookie = c.res.headers.getSetCookie().some((cookie) => cookie.startsWith(`${sessionCookieName}=`));

  if (!hasSessionCookie) {
    await setSessionCookie(c, session.token, session.result.session.expiresAt);
    c.header('Cache-Control', 'private, no-store');
  }
};

export const getSession = async (c: Context | Request) => {
  const { session, user } = await getOptionalSession(c);

  if (session && user) {
    return { session, user };
  }

  if (c instanceof Request) {
    throw new Error('Unauthorized');
  }

  throw new AppError(AuthenticationErrorCode.Unauthorized);
};

export const getOptionalSession = async (c: Context | Request): Promise<SessionValidationResult> => {
  // React Router loaders receive a Request, while the enclosing Hono context owns the response cookie.
  const context = tryGetContext();

  if (context) {
    let session = requestSessions.get(context);

    if (!session) {
      session = readSession(context, true);
      requestSessions.set(context, session);
    }

    return (await session).result;
  }

  return (await readSession(mapRequestToContextForCookie(c), false)).result;
};

const readSession = async (c: Context, renew: boolean): Promise<RequestSession> => {
  const token = await getSessionCookie(c);

  if (!token) {
    return {
      token: null,
      result: { isAuthenticated: false, session: null, user: null },
    };
  }

  return { token, result: await validateSessionToken(token, renew) };
};

export type ActiveSession = Omit<Session, 'sessionToken'>;

export const getActiveSessions = async (c: Context | Request): Promise<ActiveSession[]> => {
  const { user } = await getSession(c);

  return await prisma.session.findMany({
    where: {
      userId: user.id,
      expiresAt: {
        gt: new Date(),
      },
      updatedAt: {
        gt: new Date(Date.now() - AUTH_SESSION_IDLE_TIMEOUT),
      },
    },
    orderBy: {
      updatedAt: 'desc',
    },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      updatedAt: true,
      createdAt: true,
      ipAddress: true,
      userAgent: true,
    },
  });
};

/**
 * Todo: (RR7) Rethink, this is pretty sketchy.
 */
const mapRequestToContextForCookie = (c: Context | Request) => {
  if (c instanceof Request) {
    const partialContext = {
      req: {
        raw: c,
      },
    };

    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    return partialContext as unknown as Context;
  }

  return c;
};
