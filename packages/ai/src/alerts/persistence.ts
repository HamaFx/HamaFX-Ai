// Alert CRUD + read helpers. Used by route handlers, the cron evaluator,
// and the AI `set_alert` tool. SQL stays here so all callers see the same
// row → DTO mapping.

import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import { getDb, schema } from '@hamafx/db';
import {
  type Alert,
  type AlertChannel,
  AlertRuleSchema,
  type AlertRule,
  AlertChannelSchema,
} from '@hamafx/shared';

export interface CreateAlertInput {
  rule: AlertRule;
  channels?: AlertChannel[];
  note?: string | null;
}

export async function listAlerts(opts: { activeOnly?: boolean; limit?: number } = {}): Promise<Alert[]> {
  const filters = [];
  if (opts.activeOnly) filters.push(eq(schema.alerts.active, true));

  const rows = await getDb()
    .select()
    .from(schema.alerts)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(schema.alerts.createdAt))
    .limit(opts.limit ?? 100);

  return rows.map(rowToAlert);
}

/** Active and not-yet-fired — what the cron evaluator iterates over. */
export async function listEvaluable(): Promise<Alert[]> {
  const rows = await getDb()
    .select()
    .from(schema.alerts)
    .where(and(eq(schema.alerts.active, true), isNull(schema.alerts.firedAt)))
    .orderBy(asc(schema.alerts.createdAt));
  return rows.map(rowToAlert);
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
