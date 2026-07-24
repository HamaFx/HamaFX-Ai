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

  // Single-user deployment check: if no admin role exists, the earliest
  // created user is treated as admin. Previously this was two sequential
  // queries (count admins then fetch earliest user), which had a TOCTOU
  // window. Now collapsed into a single atomic sub-query:
  //   SELECT id FROM users ORDER BY created_at LIMIT 1
  //   WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin')
  // This ensures the earliest-user decision is atomic — concurrent first-time
  // registrations cannot both be promoted.
  const [firstUserSingleQuery] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      sql`NOT EXISTS (SELECT 1 FROM ${schema.users} WHERE ${schema.users.role} = 'admin')`,
    )
    .orderBy(schema.users.createdAt)
    .limit(1);

  if (firstUserSingleQuery && firstUserSingleQuery.id === user.id) {
    return { admin: { userId: user.id, email: user.email, name: user.name }, reason: 'authenticated' };
  }

  return { admin: null, reason: 'forbidden' };
}

export function withAdminAuth<T = Record<string, never>>(
  handler: (req: Request, ctx: { user: AdminUser; params: Promise<T> }) => Promise<Response>,
): (req: Request, ctx?: { params: Promise<T> }) => Promise<Response> {
  return async (req: Request, ctx?: { params: Promise<T> }) => {
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
    return handler(req, { user: admin, params: ctx?.params ?? (Promise.resolve({} as T)) });
  };
}
