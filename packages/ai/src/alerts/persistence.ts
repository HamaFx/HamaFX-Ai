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

export interface CreateAlertInput {
  rule: AlertRule;
  channels?: AlertChannel[];
  note?: string | null;
}

export async function listAlerts(
  opts: { activeOnly?: boolean; limit?: number } = {},
): Promise<Alert[]> {
  const filters = [];
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
      console.warn('[alerts] skipping unparseable rule', { id: row.id, err });
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
  const rows = await getDb()
    .select()
    .from(schema.alerts)
    .where(and(eq(schema.alerts.active, true), isNull(schema.alerts.firedAt)))
    .orderBy(asc(schema.alerts.createdAt));
  const out: Alert[] = [];
  for (const row of rows) {
    try {
      out.push(rowToAlert(row));
    } catch (err) {
      console.warn('[alerts] skipping unparseable rule', { id: row.id, err });
    }
  }
  return out;
}

export async function getAlert(id: string): Promise<Alert | null> {
  const rows = await getDb().select().from(schema.alerts).where(eq(schema.alerts.id, id)).limit(1);
  const row = rows[0];
  return row ? rowToAlert(row) : null;
}

export async function createAlert(input: CreateAlertInput): Promise<Alert> {
  // Re-validate at the DB boundary so a malformed rule can never reach the
  // evaluator, even if the caller skipped validation.
  const rule = AlertRuleSchema.parse(input.rule);
  const channels = (input.channels ?? ['email']).map((c) => AlertChannelSchema.parse(c));

  const inserted = await getDb()
    .insert(schema.alerts)
    .values({
      rule,
      channels,
      note: input.note ?? null,
      active: true,
      firedAt: null,
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
}

export async function updateAlert(id: string, input: UpdateAlertInput): Promise<Alert | null> {
  const patch: Partial<typeof schema.alerts.$inferInsert> = {};
  if (input.rule !== undefined) patch.rule = AlertRuleSchema.parse(input.rule);
  if (input.channels !== undefined)
    patch.channels = input.channels.map((c) => AlertChannelSchema.parse(c));
  if (input.note !== undefined) patch.note = input.note;
  if (input.active !== undefined) patch.active = input.active;
  if (input.firedAt !== undefined) {
    patch.firedAt = input.firedAt === null ? null : new Date(input.firedAt);
  }

  if (Object.keys(patch).length === 0) return getAlert(id);

  const updated = await getDb()
    .update(schema.alerts)
    .set(patch)
    .where(eq(schema.alerts.id, id))
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

export async function deleteAlert(id: string): Promise<void> {
  await getDb().delete(schema.alerts).where(eq(schema.alerts.id, id));
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
    createdAt: row.createdAt.getTime(),
  };
}
