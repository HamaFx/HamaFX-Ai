/**
 * Copyright 2026 HamaFX
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// PF-01 — Alert query helpers.
//
// Encapsulates common alert queries previously inlined across consumers.
// Using these helpers instead of importing `schema` directly decouples
// callers from Drizzle ORM internals.

import { and, desc, eq } from 'drizzle-orm';
import { getDb, schema } from '../client';

// ── Types ──────────────────────────────────────────────────────────────

export interface AlertRow {
  id: string;
  userId: string;
  rule: unknown;
  channels: string[];
  note: string | null;
  active: boolean;
  firedAt: Date | null;
  lastFiredAt: Date | null;
  snoozeHours: number;
  createdAt: Date;
}

export interface CreateAlertInput {
  userId: string;
  rule: unknown;
  channels?: string[];
  note?: string | null;
  snoozeHours?: number;
}

export interface UpdateAlertInput {
  rule?: unknown;
  channels?: string[];
  note?: string | null;
  active?: boolean;
  snoozeHours?: number;
}

// ── Queries ────────────────────────────────────────────────────────────

/**
 * List alerts for a user, most recently created first.
 */
export async function listAlerts(
  userId: string,
  limit: number = 50,
): Promise<AlertRow[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.alerts)
    .where(eq(schema.alerts.userId, userId))
    .orderBy(desc(schema.alerts.createdAt))
    .limit(limit);
}

/**
 * Get a single alert by ID, scoped to the user.
 */
export async function getAlert(
  userId: string,
  alertId: string,
): Promise<AlertRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.alerts)
    .where(
      and(
        eq(schema.alerts.id, alertId),
        eq(schema.alerts.userId, userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Create a new alert.
 */
export async function createAlert(
  input: CreateAlertInput,
): Promise<AlertRow> {
  const db = getDb();
  const rows = await db
    .insert(schema.alerts)
    .values({
      userId: input.userId,
      rule: input.rule,
      channels: input.channels ?? ['email'],
      note: input.note ?? null,
      snoozeHours: input.snoozeHours ?? 0,
    })
    .returning();
  return rows[0]!;
}

/**
 * Update an existing alert.
 */
export async function updateAlert(
  alertId: string,
  input: UpdateAlertInput,
): Promise<AlertRow | null> {
  const db = getDb();
  const rows = await db
    .update(schema.alerts)
    .set({
      ...(input.rule !== undefined ? { rule: input.rule } : {}),
      ...(input.channels !== undefined ? { channels: input.channels } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.snoozeHours !== undefined ? { snoozeHours: input.snoozeHours } : {}),
    })
    .where(eq(schema.alerts.id, alertId))
    .returning();
  return rows[0] ?? null;
}

/**
 * Delete an alert by ID.
 */
export async function deleteAlert(alertId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.alerts)
    .where(eq(schema.alerts.id, alertId));
}

/**
 * List active alerts for a user. The caller applies snooze logic.
 */
export async function listActiveAlerts(
  userId: string,
): Promise<AlertRow[]> {
  const db = getDb();
  return db
    .select()
    .from(schema.alerts)
    .where(
      and(
        eq(schema.alerts.userId, userId),
        eq(schema.alerts.active, true),
      ),
    );
}

/**
 * Mark an alert as fired, setting firedAt and lastFiredAt.
 */
export async function markAlertFired(
  alertId: string,
): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .update(schema.alerts)
    .set({
      firedAt: now,
      lastFiredAt: now,
    })
    .where(eq(schema.alerts.id, alertId));
}
