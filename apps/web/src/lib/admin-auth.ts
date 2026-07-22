// SPDX-License-Identifier: Apache-2.0

// Wrapper that checks the authenticated user has admin privileges.
// In single-user deployments (no admin role set), the sole authenticated
// user is treated as admin. In multi-user deployments, requires role='admin'.

import { eq, sql } from 'drizzle-orm';

import { auth } from '@/auth';
import { schema } from '@hamafx/db';
import { getDb } from '@hamafx/ai';

import { createRequestLogger } from './logger';

export interface AdminUser {
  userId: string;
  email: string;
  name: string | null;
}

export interface AdminAuthResult {
  admin: AdminUser | null;
  /** 'unauthenticated' when no session exists; 'forbidden' when session exists but not admin. */
  reason: 'authenticated' | 'unauthenticated' | 'forbidden';
}

export async function getAdminUser(): Promise<AdminAuthResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { admin: null, reason: 'unauthenticated' };
  }

  const db = getDb();
  const [user] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
    })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id));

  if (!user) {
    return { admin: null, reason: 'forbidden' };
  }

  // Admin if role is 'admin' OR if this is a single-user deployment
  // (no users with role='admin' exist, meaning the sole user is the operator)
  if (user.role === 'admin') {
    return { admin: { userId: user.id, email: user.email, name: user.name }, reason: 'authenticated' };
  }

  // Check if any admin exists.
  // Security: single-user mode only grants admin to the *earliest* user
  // (by creation date), not ALL authenticated users. This prevents privilege
  // escalation when a second user registers before the first admin is promoted.
  const [adminCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.users)
    .where(eq(schema.users.role, 'admin'));

  if (Number(adminCount?.count ?? 0) === 0) {
    // No admins exist — single-user mode.
    // Only promote the earliest-created user.
    const [firstUser] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .orderBy(schema.users.createdAt)
      .limit(1);
    if (firstUser && firstUser.id === user.id) {
      return { admin: { userId: user.id, email: user.email, name: user.name }, reason: 'authenticated' };
    }
  }

  return { admin: null, reason: 'forbidden' };
}

export function withAdminAuth(
  handler: (req: Request, ctx: { user: AdminUser }) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const log = createRequestLogger(req);
    const { admin, reason } = await getAdminUser();
    if (!admin) {
      const status = reason === 'unauthenticated' ? 401 : 403;
      const code = reason === 'unauthenticated' ? 'UNAUTHORIZED' : 'FORBIDDEN';
      const message = reason === 'unauthenticated' ? 'Authentication required' : 'Admin access required';
      log.warn('admin route access denied', { reason });
      return Response.json({ error: { code, message } }, { status });
    }
    log.info('admin route accessed', { userId: admin.userId });
    return handler(req, { user: admin });
  };
}
