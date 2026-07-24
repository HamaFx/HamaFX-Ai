// SPDX-License-Identifier: Apache-2.0

// PF-22 — Admin service layer.
//
// Handles admin-only operations: feature flags and user management.
//
// Pattern: Service (PF-22). Controllers remain thin: parse request →
// call service → format Response.

import { eq } from 'drizzle-orm';
import {
  countAdmins,
  countUsers,
  getDb,
  listFeatureFlags,
  listUsersWithSettings,
  recordAdminAudit as recordAdminAuditDb,
  schema,
  updateUserRole,
  upsertFeatureFlag,
} from '@hamafx/db';

import type { FeatureFlagsDTO, UserListDTO } from './admin-dtos';

// ── Service functions ────────────────────────────────────────────────────────

export async function listFeaturesService(): Promise<FeatureFlagsDTO> {
  const rows = await listFeatureFlags();
  const features: Record<string, boolean> = {};
  for (const row of rows) {
    features[row.key] = row.enabled;
  }
  return { features };
}

export async function upsertFeaturesService(
  toggles: Record<string, boolean>,
  userId: string,
): Promise<void> {
  const entries = Object.entries(toggles);
  if (entries.length === 0) return;

  for (const [key, enabled] of entries) {
    await upsertFeatureFlag(key, enabled, userId);
  }

  await recordAdminAuditDb(userId, 'feature.toggle', undefined, { toggles });
}

export async function listUsersService(
  limit: number,
  offset: number,
  q?: string,
): Promise<UserListDTO> {
  const [users, total] = await Promise.all([
    listUsersWithSettings(limit, offset, q),
    countUsers(q),
  ]);
  // Normalize DB rows to the public DTO: role defaults to 'user' and dates
  // are serialised to ISO strings so the client does not receive Date objects.
  return {
    users: users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role ?? 'user',
      createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt,
      onboardingCompleted: user.onboardingCompleted,
    })),
    total,
  };
}

export interface UpdateUserRoleInput {
  actorUserId: string;
  targetUserId: string;
  role: 'admin' | 'user';
}

export interface UpdateUserRoleResult {
  ok: true;
  previousRole: string | null;
}

export class LastAdminError extends Error {
  constructor() {
    super('Cannot demote the last admin');
  }
}

export class SelfDemoteError extends Error {
  constructor() {
    super('Cannot demote yourself');
  }
}

/**
 * Promote or demote a user. Refuses to demote the last remaining admin
 * or the current admin themself. In single-user mode (no explicit admin
 * rows), the earliest user is treated as the implicit admin and cannot
 * be demoted.
 *
 * Records an admin audit log entry on success.
 */
export const recordAdminAudit = recordAdminAuditDb;

export async function updateUserRoleService({
  actorUserId,
  targetUserId,
  role,
}: UpdateUserRoleInput): Promise<UpdateUserRoleResult> {
  if (actorUserId === targetUserId) {
    throw new SelfDemoteError();
  }

  const db = getDb();

  // Resolve the target user and current admin count.
  const [targetRow, adminCount] = await Promise.all([
    db
      .select({ id: schema.users.id, role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, targetUserId))
      .limit(1),
    countAdmins(),
  ]);

  const target = targetRow[0];
  if (!target) {
    throw new Error('User not found');
  }

  const previousRole = target.role ?? 'user';

  // Refuse to demote the last explicit admin.
  if (role === 'user' && previousRole === 'admin' && adminCount <= 1) {
    throw new LastAdminError();
  }

  // Single-user safety net: if no explicit admin rows exist, the earliest
  // user is the implicit admin and cannot be demoted.
  if (role === 'user' && adminCount === 0) {
    const [firstUser] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .orderBy(schema.users.createdAt)
      .limit(1);
    if (firstUser?.id === targetUserId) {
      throw new LastAdminError();
    }
  }

  // No-op when the role is unchanged.
  if (previousRole === role) {
    return { ok: true as const, previousRole };
  }

  await updateUserRole(targetUserId, role);

  await recordAdminAudit(actorUserId, 'user.role.update', targetUserId, {
    previousRole,
    newRole: role,
  });

  return { ok: true as const, previousRole };
}
