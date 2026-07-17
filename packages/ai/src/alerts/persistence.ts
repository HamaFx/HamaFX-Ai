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

// Alert CRUD + read helpers. Used by route handlers, the cron evaluator,
// and the AI `set_alert` tool. SQL stays here so all callers see the same
// row → DTO mapping.

import { getDb, schema } from '@hamafx/db';
import {
  AlertChannelSchema,
  AlertRuleSchema,
  type Alert,
  type AlertChannel,
  type AlertRule,
} from '@hamafx/shared';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { createCategorizedLogger } from '@hamafx/shared/logger';

const plog = createCategorizedLogger('ai', { component: 'alerts-persistence' });

export interface CreateAlertInput {
  userId: string;
  rule: AlertRule;
  channels?: AlertChannel[];
  note?: string | null;
  /**
   * Phase C — UX_UPGRADE_PLAN.md item 17. Snooze window in
   * hours (0..168). 0 = one-shot (legacy). Default 0 so
   * existing callers don't need to change.
   */
  snoozeHours?: number;
}

export async function listAlerts(
  userId: string,
  opts: { activeOnly?: boolean; limit?: number } = {},
): Promise<Alert[]> {
  const filters = [eq(schema.alerts.userId, userId)];
  if (opts.activeOnly) filters.push(eq(schema.alerts.active, true));

  const rows = await getDb()
    .select()
    .from(schema.alerts)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(schema.alerts.createdAt))
    .limit(opts.limit ?? 100);

  // Skip rows with rules we can no longer parse (e.g. legacy malformed
  // indicator specs). The cron evaluator does the same in `listEvaluable`.
  const out: Alert[] = [];
  for (const row of rows) {
    try {
      out.push(rowToAlert(row));
    } catch (err) {
      plog.warn('skipping unparseable rule', { id: row.id, err: String(err) });
    }
  }
  return out;
}

/**
 * Active and not-yet-fired — what the cron evaluator iterates over.
 *
 * Phase 1 hardening §11 — invalid `indicatorCross.indicator` strings
 * (legacy "rsi:14:bogus" style) used to silently behave as `rsi(14)`.
 * The schema is now strict, so a row with a malformed indicator throws
 * during `rowToAlert`. We catch that here and skip the row instead of
 * crashing the cron tick — the user can fix the rule in the UI.
 */
export async function listEvaluable(): Promise<Alert[]> {
  // Phase C — UX_UPGRADE_PLAN.md item 17. Snooze filter.
  //
  // We can't do a "now >= lastFiredAt + snoozeHours" check in raw
  // SQL (Drizzle's pg-core doesn't expose a clean interval-arithmetic
  // builder for hours across all our drivers), so we pull
  // active rows and filter in JS. The set is small — the cron
  // pulls only active alerts that haven't fired-and-deactivated,
  // and after Phase 17 the snoozed set is a subset of that.
  const rows = await getDb()
    .select()
    .from(schema.alerts)
    .where(and(eq(schema.alerts.active, true), isNull(schema.alerts.firedAt)))
    .orderBy(asc(schema.alerts.createdAt));
  const out: Alert[] = [];
  const now = Date.now();
  for (const row of rows) {
    try {
      const alert = rowToAlert(row);
      // Phase C — item 17. Snooze gate. Delegate to the pure
      // helper so the cron policy is unit-testable.
      if (isInSnooze(alert, now)) continue;
      out.push(alert);
    } catch (err) {
      plog.warn('skipping unparseable rule', { id: row.id, err: String(err) });
    }
  }
  return out;
}

export async function getAlert(userId: string, id: string): Promise<Alert | null> {
  const rows = await getDb().select().from(schema.alerts).where(and(eq(schema.alerts.id, id), eq(schema.alerts.userId, userId))).limit(1);
  const row = rows[0];
  return row ? rowToAlert(row) : null;
}

export async function createAlert(input: CreateAlertInput): Promise<Alert> {
  // Re-validate at the DB boundary so a malformed rule can never reach the
  // evaluator, even if the caller skipped validation.
  const rule = AlertRuleSchema.parse(input.rule);
  const channels = (input.channels ?? ['email']).map((c) => AlertChannelSchema.parse(c));
  // Phase C — item 17. Clamp snoozeHours to the schema's
  // documented range (0..168). Caller validation should have
  // caught this already; the bound is a defensive guard.
  const snoozeHours = Math.max(0, Math.min(168, Math.trunc(input.snoozeHours ?? 0)));

  const inserted = await getDb()
    .insert(schema.alerts)
    .values({
      userId: input.userId,
      rule,
      channels,
      note: input.note ?? null,
      active: true,
      firedAt: null,
      lastFiredAt: null,
      snoozeHours,
    })
    .returning();
  return rowToAlert(inserted[0]!);
}

export interface UpdateAlertInput {
  rule?: AlertRule | undefined;
  channels?: AlertChannel[] | undefined;
  note?: string | null | undefined;
  active?: boolean | undefined;
  /** Pass `null` to re-arm a fired alert. */
  firedAt?: number | null | undefined;
  /**
   * Phase C — UX_UPGRADE_PLAN.md item 17. Update the snooze
   * window. Validation mirrors the schema (0..168). Pass
   * `undefined` to leave unchanged.
   */
  snoozeHours?: number | undefined;
}

export async function updateAlert(userId: string, id: string, input: UpdateAlertInput): Promise<Alert | null> {
  const patch: Partial<typeof schema.alerts.$inferInsert> = {};
  if (input.rule !== undefined) patch.rule = AlertRuleSchema.parse(input.rule);
  if (input.channels !== undefined)
    patch.channels = input.channels.map((c) => AlertChannelSchema.parse(c));
  if (input.note !== undefined) patch.note = input.note;
  if (input.active !== undefined) patch.active = input.active;
  if (input.firedAt !== undefined) {
    patch.firedAt = input.firedAt === null ? null : new Date(input.firedAt);
  }
  if (input.snoozeHours !== undefined) {
    patch.snoozeHours = Math.max(0, Math.min(168, Math.trunc(input.snoozeHours)));
  }

  if (Object.keys(patch).length === 0) return getAlert(userId, id);

  const updated = await getDb()
    .update(schema.alerts)
    .set(patch)
    .where(and(eq(schema.alerts.id, id), eq(schema.alerts.userId, userId)))
    .returning();
  return updated[0] ? rowToAlert(updated[0]) : null;
}

/** Mark fired + deactivate (one-shot semantics — see schemas/alerts.ts). */
export async function markFired(id: string, when = new Date()): Promise<void> {
  await getDb()
    .update(schema.alerts)
    .set({ firedAt: when, active: false })
    .where(eq(schema.alerts.id, id));
}

/**
 * Mark fired WITHOUT deactivating. The alert stays `active=true` and the cron will
 * skip it until `now >= lastFiredAt + snoozeHours interval`. This
 * is the snooze path; the one-shot path above stays unchanged.
 */
export async function markFiredSnoozed(
  id: string,
  when = new Date(),
): Promise<void> {
  await getDb()
    .update(schema.alerts)
    .set({ lastFiredAt: when })
    .where(eq(schema.alerts.id, id));
}

/**
 * Phase C — UX_UPGRADE_PLAN.md item 17. Pure snooze gate.
 *
 * Returns true when the alert is currently dormant because its
 * snooze window hasn't elapsed since the last fire. The cron
 * uses this to filter `listEvaluable` results.
 *
 * Pure function (no I/O) so it can be unit-tested without a DB.
 * Alert types are loosely typed — callers pass any object that
 * exposes `lastFiredAt` and `snoozeHours`.
 */
export function isInSnooze(
  alert: {
    lastFiredAt?: number | null | undefined;
    snoozeHours?: number | null | undefined;
  },
  now: number = Date.now(),
): boolean {
  const last = alert.lastFiredAt;
  const snooze = alert.snoozeHours ?? 0;
  if (typeof last !== 'number' || snooze <= 0) return false;
  const elapsedHours = (now - last) / 3_600_000;
  return elapsedHours < snooze;
}

/**
 * Phase C — UX_UPGRADE_PLAN.md item 17. Single entry point for
 * the delivery layer. Picks the one-shot vs snoozed path based on
 * `alert.snoozeHours`. The delivery layer doesn't need to know
 * about the difference; it just calls this after a 2xx response.
 */
export async function markFiredForAlert(alert: Alert, when = new Date()): Promise<void> {
  if (alert.snoozeHours > 0) {
    await markFiredSnoozed(alert.id, when);
  } else {
    await markFired(alert.id, when);
  }
}

/**
 * Update the cached `previousValue` on an indicatorCross rule so the next
 * evaluator tick can detect crossings. The full rule is rewritten to
 * preserve the discriminated-union shape — Drizzle's JSONB column doesn't
 * support partial paths.
 */
export async function setRulePreviousValue(id: string, rule: AlertRule, value: number): Promise<void> {
  if (rule.type !== 'indicatorCross') return;
  const next = { ...rule, previousValue: value };
  // Re-validate: if the rule was edited concurrently, the in-memory copy
  // we patched may be stale, but the schema check still keeps malformed
  // shapes from landing in the DB.
  const validated = AlertRuleSchema.parse(next);
  await getDb()
    .update(schema.alerts)
    .set({ rule: validated })
    .where(eq(schema.alerts.id, id));
}

export async function deleteAlert(userId: string, id: string): Promise<void> {
  await getDb().delete(schema.alerts).where(and(eq(schema.alerts.id, id), eq(schema.alerts.userId, userId)));
}

function rowToAlert(row: typeof schema.alerts.$inferSelect): Alert {
  return {
    id: row.id,
    rule: AlertRuleSchema.parse(row.rule),
    channels: ((row.channels ?? []) as string[])
      .map((c) => AlertChannelSchema.safeParse(c))
      .flatMap((r) => (r.success ? [r.data] : [])),
    note: row.note,
    active: row.active,
    firedAt: row.firedAt ? row.firedAt.getTime() : null,
    /**
     * Phase C — UX_UPGRADE_PLAN.md item 17. Pass through the
     * snooze state. `lastFiredAt` may be null on legacy rows
     * (the column was added in migration 0011); the schema
     * declares it optional so this is type-safe.
     */
    lastFiredAt: row.lastFiredAt ? row.lastFiredAt.getTime() : null,
    snoozeHours: row.snoozeHours ?? 0,
    userId: row.userId!,
    createdAt: row.createdAt.getTime(),
  };
}
