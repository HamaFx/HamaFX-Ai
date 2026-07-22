// SPDX-License-Identifier: Apache-2.0

// Session-callback validators extracted from auth.ts so they can be
// unit-tested without booting NextAuth. The module keeps the same
// throttling semantics but combines the tokenVersion and session-row
// checks into one query to cut DB round-trips.

import { eq } from 'drizzle-orm';
import { logErrorContext } from '@hamafx/shared/logger';
import { schema, type DbClient } from '@hamafx/db';

const TV_CHECK_INTERVAL_SECONDS = 60;
const LAST_ACTIVE_INTERVAL_SECONDS = 900;
const SESSION_AGE_LIMIT_SECONDS = 86400;

export interface SessionToken {
  id?: string | null;
  tokenVersion?: number | null;
  sessionId?: string | null;
  iat?: number | null;
  rememberMe?: boolean | null;
  tvCheckedAt?: number | null;
  lastActiveUpdate?: number | null;
}

interface ValidateOptions {
  /**
   * When true, DB errors during validation invalidate the session.
   * Default false (fail open) so users are not locked out when the
   * DB is temporarily unreachable.
   */
  failClosed?: boolean;
}

function invalidatedSession(session: unknown) {
  return { ...(session as Record<string, unknown>), user: undefined, expires: '0' };
}

/**
 * Run the throttled session validations that used to live inline in
 * auth.ts. Returns `null` when the session is still valid (and mutates
 * the token timestamps), or an invalidated session object when the
 * session should be destroyed.
 */
export async function validateSession(
  db: DbClient,
  token: SessionToken,
  session: unknown,
  nowSeconds: number,
  opts: ValidateOptions = {},
): Promise<unknown | null> {
  // FEAT-04: Without rememberMe, invalidate sessions older than 24h.
  if (token.iat && token.rememberMe !== true && nowSeconds - token.iat > SESSION_AGE_LIMIT_SECONDS) {
    return invalidatedSession(session);
  }

  const lastChecked = token.tvCheckedAt;
  if (!lastChecked || nowSeconds - lastChecked > TV_CHECK_INTERVAL_SECONDS) {
    try {
      const userId = token.id;
      const sessionId = token.sessionId;
      if (!userId) {
        return invalidatedSession(session);
      }

      const [row] = await db
        .select({
          tv: schema.users.tokenVersion,
          sessionId: schema.userSessions.id,
        })
        .from(schema.users)
        .leftJoin(schema.userSessions, eq(schema.userSessions.id, sessionId ?? ''))
        .where(eq(schema.users.id, userId))
        .limit(1);

      if (!row) {
        return invalidatedSession(session);
      }

      if (row.tv !== token.tokenVersion) {
        return invalidatedSession(session);
      }

      if (!row.sessionId) {
        return invalidatedSession(session);
      }

      token.tvCheckedAt = nowSeconds;
    } catch (err) {
      logErrorContext(err, 'auth/session_validation', {}, 'auth');
      if (opts.failClosed) {
        return invalidatedSession(session);
      }
    }
  }

  // FEAT-02: Track last active time every 15 min.
  const lastActiveUpdate = token.lastActiveUpdate;
  const sessionId = token.sessionId;
  if (sessionId && (!lastActiveUpdate || nowSeconds - lastActiveUpdate > LAST_ACTIVE_INTERVAL_SECONDS)) {
    try {
      await db
        .update(schema.userSessions)
        .set({ lastActiveAt: new Date() })
        .where(eq(schema.userSessions.id, sessionId));
      token.lastActiveUpdate = nowSeconds;
    } catch (err) {
      logErrorContext(err, 'auth/last_active_update', {}, 'auth');
      if (opts.failClosed) {
        return invalidatedSession(session);
      }
    }
  }

  return null;
}
