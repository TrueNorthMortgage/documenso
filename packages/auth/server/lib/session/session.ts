import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import type { RequestMetadata } from '@documenso/lib/universal/extract-request-metadata';
import { prisma } from '@documenso/prisma';
import { sha256 } from '@oslojs/crypto/sha2';
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from '@oslojs/encoding';
import { type Session, type User, UserSecurityAuditLogType } from '@prisma/client';

import { AUTH_SESSION_IDLE_TIMEOUT } from '../../config';

const sessionUserSelect = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  avatarImageId: true,
  twoFactorEnabled: true,
  roles: true,
  signature: true,
} as const;

/**
 * The user object to pass around the app.
 *
 * Do not put anything sensitive in here since it will be public.
 */
export type SessionUser = Pick<
  User,
  'id' | 'name' | 'email' | 'emailVerified' | 'avatarImageId' | 'twoFactorEnabled' | 'roles' | 'signature'
>;

export type SessionValidationResult =
  | {
      session: Session;
      user: SessionUser;
      isAuthenticated: true;
    }
  | { session: null; user: null; isAuthenticated: false };

export const generateSessionToken = (): string => {
  const bytes = new Uint8Array(20);

  crypto.getRandomValues(bytes);

  const token = encodeBase32LowerCaseNoPadding(bytes);

  return token;
};

export const createSession = async (token: string, userId: number, metadata: RequestMetadata): Promise<Session> => {
  const hashedSessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
  const now = new Date();

  const session: Session = {
    id: hashedSessionId,
    sessionToken: hashedSessionId,
    userId,
    updatedAt: now,
    createdAt: now,
    expiresAt: new Date(now.getTime() + AUTH_SESSION_IDLE_TIMEOUT),
    ipAddress: metadata.ipAddress ?? null,
    userAgent: metadata.userAgent ?? null,
  };

  await prisma.session.create({
    data: session,
  });

  await prisma.userSecurityAuditLog.create({
    data: {
      userId,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      type: UserSecurityAuditLogType.SIGN_IN,
    },
  });

  return session;
};

export const validateSessionToken = async (token: string, renew = false): Promise<SessionValidationResult> => {
  const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
  const now = new Date();
  const idleSince = new Date(now.getTime() - AUTH_SESSION_IDLE_TIMEOUT);
  const include = { user: { select: sessionUserSelect } } as const;

  if (renew) {
    // A concurrent request may already have renewed the session with a later deadline.
    const [result] = await prisma.session.updateManyAndReturn({
      where: {
        id: sessionId,
        user: { isNot: null },
        expiresAt: { gt: now },
        updatedAt: { gt: idleSince, lt: now },
      },
      data: { updatedAt: now, expiresAt: new Date(now.getTime() + AUTH_SESSION_IDLE_TIMEOUT) },
      include,
    });

    if (result?.user) {
      const { user, ...session } = result;
      return { session, user, isAuthenticated: true };
    }
  }

  const result = await prisma.session.findUnique({ where: { id: sessionId }, include });

  if (!result?.user) {
    return { session: null, user: null, isAuthenticated: false };
  }

  const { user, ...session } = result;

  if (session.expiresAt <= now || session.updatedAt <= idleSince) {
    await prisma.session.deleteMany({
      where: { id: sessionId, OR: [{ expiresAt: { lte: now } }, { updatedAt: { lte: idleSince } }] },
    });
    return { session: null, user: null, isAuthenticated: false };
  }

  return { session, user, isAuthenticated: true };
};

type InvalidateSessionsOptions = {
  userId: number;
  sessionIds: string[];
  metadata: RequestMetadata;
  isRevoke?: boolean;
};

export const invalidateSessions = async ({
  userId,
  sessionIds,
  metadata,
  isRevoke,
}: InvalidateSessionsOptions): Promise<void> => {
  if (sessionIds.length === 0) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.session.deleteMany({
      where: {
        userId,
        id: { in: sessionIds },
      },
    });

    if (count !== sessionIds.length) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: 'One or more sessions are not valid.',
      });
    }

    await tx.userSecurityAuditLog.createMany({
      data: sessionIds.map(() => ({
        userId,
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
        type: isRevoke ? UserSecurityAuditLogType.SESSION_REVOKED : UserSecurityAuditLogType.SIGN_OUT,
      })),
    });
  });
};
