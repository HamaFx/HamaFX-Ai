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

// Phase 2 + Phase 3 migration tests
//
// Applies all migrations up through 0029 on a fresh PGlite instance,
// then verifies that CHECK constraints, bigint conversions, unique
// constraints, index renames, and the new evaluated_at index are
// present and functional.

import { readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closePGliteDb, getPGliteDb, executeWithFallback, sanitizeStatement } from '../src/pglite-client';

const HERE = dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = join(HERE, '..', 'drizzle');

/** Strip leading comment lines from a SQL statement. */
function stripComments(sql: string): string {
  const lines = sql.split('\n');
  while (
    lines.length > 0 &&
    (lines[0]!.trim() === '' || lines[0]!.trim().startsWith('--'))
  ) {
    lines.shift();
  }
  return lines.join('\n').trim();
}


/** Apply a single migration tag. */
async function applyOne(
  db: Awaited<ReturnType<typeof getPGliteDb>>,
  tag: string,
): Promise<void> {
  const rawSql = readFileSync(join(DRIZZLE_DIR, `${tag}.sql`), 'utf-8');
  for (const stmt of rawSql.split('--> statement-breakpoint')) {
    const trimmed = stripComments(stmt.trim());
    if (!trimmed) continue;
    const safe = sanitizeStatement(trimmed);
    if (!safe.trim() || safe.trim().startsWith('--')) continue;
    await executeWithFallback(db, safe);
  }
}

/** Apply all migrations including the given tag. */
async function applyAllThrough(
  db: Awaited<ReturnType<typeof getPGliteDb>>,
  lastTag: string,
): Promise<void> {
  const journal = JSON.parse(
    readFileSync(join(DRIZZLE_DIR, 'meta', '_journal.json'), 'utf-8'),
  ) as { entries: Array<{ tag: string }> };
  for (const entry of journal.entries) {
    await applyOne(db, entry.tag);
    if (entry.tag === lastTag) break;
  }
}

describe('Phase 2 — data integrity constraints (migration 0028)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hamafx-phase2-'));
  });

  afterEach(async () => {
    await closePGliteDb();
  });

  it('rejects alerts.snooze_hours > 168', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0028_phase2_data_integrity');
    await db.execute(`INSERT INTO "user" (id, email) VALUES ('u-alert', 'u-alert@localhost')`);
    await expect(
      db.execute(`INSERT INTO "alerts" (user_id, rule, channels, snooze_hours) VALUES ('u-alert', '{}'::jsonb, ARRAY['email'], 200)`),
    ).rejects.toThrow();
  });

  it('rejects alerts.snooze_hours < 0', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0028_phase2_data_integrity');
    await db.execute(`INSERT INTO "user" (id, email) VALUES ('u-alert2', 'u-alert2@localhost')`);
    await expect(
      db.execute(`INSERT INTO "alerts" (user_id, rule, channels, snooze_hours) VALUES ('u-alert2', '{}'::jsonb, ARRAY['email'], -1)`),
    ).rejects.toThrow();
  });

  it('accepts alerts.snooze_hours = 0 and = 168', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0028_phase2_data_integrity');
    await db.execute(`INSERT INTO "user" (id, email) VALUES ('u-alert3', 'u-alert3@localhost')`);
    await db.execute(`INSERT INTO "alerts" (user_id, rule, channels, snooze_hours) VALUES ('u-alert3', '{}'::jsonb, ARRAY['email'], 0)`);
    await db.execute(`INSERT INTO "alerts" (user_id, rule, channels, snooze_hours) VALUES ('u-alert3', '{}'::jsonb, ARRAY['email'], 168)`);
    const { rows } = await db.execute(`SELECT count(*)::int as cnt FROM "alerts" WHERE user_id = 'u-alert3'`);
    expect(rows[0]?.cnt).toBe(2);
  });

  it('rejects decision_signals.confidence > 1.0', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0028_phase2_data_integrity');
    await db.execute(`INSERT INTO "user" (id, email) VALUES ('u-sig', 'u-sig@localhost')`);
    await expect(
      db.execute(`INSERT INTO "decision_signals" (user_id, symbol, action, bias, confidence, horizon, anchor_price, anchor_at, source_type) VALUES ('u-sig', 'XAUUSD', 'buy', 'bullish', 1.5, '1d', 2000.0, now(), 'chat')`),
    ).rejects.toThrow();
  });

  it('rejects decision_signals.confidence < 0.0', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0028_phase2_data_integrity');
    await db.execute(`INSERT INTO "user" (id, email) VALUES ('u-sig2', 'u-sig2@localhost')`);
    await expect(
      db.execute(`INSERT INTO "decision_signals" (user_id, symbol, action, bias, confidence, horizon, anchor_price, anchor_at, source_type) VALUES ('u-sig2', 'XAUUSD', 'buy', 'bullish', -0.5, '1d', 2000.0, now(), 'chat')`),
    ).rejects.toThrow();
  });

  it('accepts decision_signals.confidence = NULL, 0.0, and 1.0', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0028_phase2_data_integrity');
    await db.execute(`INSERT INTO "user" (id, email) VALUES ('u-sig3', 'u-sig3@localhost')`);
    await db.execute(`INSERT INTO "decision_signals" (user_id, symbol, action, bias, confidence, horizon, anchor_price, anchor_at, source_type) VALUES ('u-sig3', 'XAUUSD', 'buy', 'bullish', NULL, '1d', 2000.0, now(), 'chat')`);
    await db.execute(`INSERT INTO "decision_signals" (user_id, symbol, action, bias, confidence, horizon, anchor_price, anchor_at, source_type) VALUES ('u-sig3', 'EURUSD', 'sell', 'bearish', 0.0, '1d', 1.08, now(), 'chat')`);
    await db.execute(`INSERT INTO "decision_signals" (user_id, symbol, action, bias, confidence, horizon, anchor_price, anchor_at, source_type) VALUES ('u-sig3', 'GBPUSD', 'hold', 'neutral', 1.0, '1d', 1.27, now(), 'chat')`);
    const { rows } = await db.execute(`SELECT count(*)::int as cnt FROM "decision_signals" WHERE user_id = 'u-sig3'`);
    expect(rows[0]?.cnt).toBe(3);
  });

  it('rejects portfolio_settings.max_risk_per_trade_pct > 100', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0028_phase2_data_integrity');
    await db.execute(`INSERT INTO "user" (id, email) VALUES ('u-port', 'u-port@localhost')`);
    await expect(
      db.execute(`INSERT INTO "portfolio_settings" (user_id, max_risk_per_trade_pct, max_total_exposure_pct) VALUES ('u-port', 150, 10)`),
    ).rejects.toThrow();
  });

  it('rejects portfolio_settings.max_total_exposure_pct < 0', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0028_phase2_data_integrity');
    await db.execute(`INSERT INTO "user" (id, email) VALUES ('u-port2', 'u-port2@localhost')`);
    await expect(
      db.execute(`INSERT INTO "portfolio_settings" (user_id, max_risk_per_trade_pct, max_total_exposure_pct) VALUES ('u-port2', 2, -5)`),
    ).rejects.toThrow();
  });

  it('accepts portfolio_settings with valid percentages', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0028_phase2_data_integrity');
    await db.execute(`INSERT INTO "user" (id, email) VALUES ('u-port3', 'u-port3@localhost')`);
    await db.execute(`INSERT INTO "portfolio_settings" (user_id, max_risk_per_trade_pct, max_total_exposure_pct) VALUES ('u-port3', 0, 100)`);
    const { rows } = await db.execute(`SELECT max_risk_per_trade_pct, max_total_exposure_pct FROM "portfolio_settings" WHERE user_id = 'u-port3'`);
    expect(rows[0]).toEqual({ max_risk_per_trade_pct: 0, max_total_exposure_pct: 100 });
  });

  it('rejects briefings_emitted.kind outside allowed set', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0028_phase2_data_integrity');
    await db.execute(`INSERT INTO "user" (id, email) VALUES ('u-brief', 'u-brief@localhost')`);
    await db.execute(`INSERT INTO "chat_threads" (id, user_id, title) VALUES ('00000000-0000-0000-0000-000000000010', 'u-brief', 'Test')`);
    await db.execute(`INSERT INTO "chat_messages" (id, thread_id, role, content) VALUES ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000010', 'assistant', '{}'::jsonb)`);
    await expect(
      db.execute(`INSERT INTO "briefings_emitted" (user_id, event_id, kind, message_id) VALUES ('u-brief', 'evt-1', 'invalid_kind', '00000000-0000-0000-0000-000000000100')`),
    ).rejects.toThrow();
  });

  it('accepts briefings_emitted.kind = pre, post, weekly_review', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0028_phase2_data_integrity');
    await db.execute(`INSERT INTO "user" (id, email) VALUES ('u-brief2', 'u-brief2@localhost')`);
    await db.execute(`INSERT INTO "chat_threads" (id, user_id, title) VALUES ('00000000-0000-0000-0000-000000000020', 'u-brief2', 'Test')`);
    await db.execute(`INSERT INTO "chat_messages" (id, thread_id, role, content) VALUES ('00000000-0000-0000-0000-000000000200', '00000000-0000-0000-0000-000000000020', 'assistant', '{}'::jsonb)`);
    for (const kind of ['pre', 'post', 'weekly_review']) {
      await db.execute(`INSERT INTO "briefings_emitted" (user_id, event_id, kind, message_id) VALUES ('u-brief2', 'evt-${kind}', '${kind}', '00000000-0000-0000-0000-000000000200')`);
    }
    const { rows } = await db.execute(`SELECT count(*)::int as cnt FROM "briefings_emitted" WHERE user_id = 'u-brief2'`);
    expect(rows[0]?.cnt).toBe(3);
  });

  it('rejects journal_entries with outcome=win but closedAt=NULL', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0028_phase2_data_integrity');
    await db.execute(`INSERT INTO "user" (id, email) VALUES ('u-jnl', 'u-jnl@localhost')`);
    await expect(
      db.execute(`INSERT INTO "journal_entries" (user_id, symbol, side, opened_at, entry, outcome, closed_at) VALUES ('u-jnl', 'XAUUSD', 'long', now(), 2000.0, 'win', NULL)`),
    ).rejects.toThrow();
  });

  it('rejects journal_entries with outcome=open but closedAt set', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0028_phase2_data_integrity');
    await db.execute(`INSERT INTO "user" (id, email) VALUES ('u-jnl2', 'u-jnl2@localhost')`);
    await expect(
      db.execute(`INSERT INTO "journal_entries" (user_id, symbol, side, opened_at, entry, outcome, closed_at) VALUES ('u-jnl2', 'XAUUSD', 'long', now(), 2000.0, 'open', now())`),
    ).rejects.toThrow();
  });

  it('accepts consistent journal_entries', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0028_phase2_data_integrity');
    await db.execute(`INSERT INTO "user" (id, email) VALUES ('u-jnl3', 'u-jnl3@localhost')`);
    await db.execute(`INSERT INTO "journal_entries" (user_id, symbol, side, opened_at, entry, outcome, closed_at) VALUES ('u-jnl3', 'XAUUSD', 'long', now(), 2000.0, 'open', NULL)`);
    await db.execute(`INSERT INTO "journal_entries" (user_id, symbol, side, opened_at, entry, outcome, closed_at, exit) VALUES ('u-jnl3', 'EURUSD', 'short', now(), 1.08, 'win', now(), 1.07)`);
    const { rows } = await db.execute(`SELECT count(*)::int as cnt FROM "journal_entries" WHERE user_id = 'u-jnl3'`);
    expect(rows[0]?.cnt).toBe(2);
  });

  it('rejects portfolio_positions with status=closed but closedAt=NULL', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0028_phase2_data_integrity');
    await db.execute(`INSERT INTO "user" (id, email) VALUES ('u-pos', 'u-pos@localhost')`);
    await expect(
      db.execute(`INSERT INTO "portfolio_positions" (user_id, symbol, direction, lot_size, entry_price, opened_at, status, closed_at) VALUES ('u-pos', 'XAUUSD', 'long', 1.0, 2000.0, now(), 'closed', NULL)`),
    ).rejects.toThrow();
  });

  it('rejects portfolio_positions with status=open but closedAt set', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0028_phase2_data_integrity');
    await db.execute(`INSERT INTO "user" (id, email) VALUES ('u-pos2', 'u-pos2@localhost')`);
    await expect(
      db.execute(`INSERT INTO "portfolio_positions" (user_id, symbol, direction, lot_size, entry_price, opened_at, status, closed_at) VALUES ('u-pos2', 'XAUUSD', 'long', 1.0, 2000.0, now(), 'open', now())`),
    ).rejects.toThrow();
  });

  it('accepts consistent portfolio_positions', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0028_phase2_data_integrity');
    await db.execute(`INSERT INTO "user" (id, email) VALUES ('u-pos3', 'u-pos3@localhost')`);
    await db.execute(`INSERT INTO "portfolio_positions" (user_id, symbol, direction, lot_size, entry_price, opened_at, status) VALUES ('u-pos3', 'XAUUSD', 'long', 1.0, 2000.0, now(), 'open')`);
    await db.execute(`INSERT INTO "portfolio_positions" (user_id, symbol, direction, lot_size, entry_price, opened_at, status, closed_at, close_price) VALUES ('u-pos3', 'EURUSD', 'short', 0.5, 1.08, now(), 'closed', now(), 1.07)`);
    const { rows } = await db.execute(`SELECT count(*)::int as cnt FROM "portfolio_positions" WHERE user_id = 'u-pos3'`);
    expect(rows[0]?.cnt).toBe(2);
  });

  it('cot_reports columns accept values > 2.1B (bigint range)', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0028_phase2_data_integrity');
    const largeValue = 3_000_000_000;
    await db.execute(`INSERT INTO "cot_reports" (id, symbol, report_date, dealer_long, dealer_short, source) VALUES ('cftc:XAUUSD:2026-01-01', 'XAUUSD', '2026-01-01', ${largeValue}, ${largeValue}, 'cftc')`);
    const { rows } = await db.execute(`SELECT dealer_long, dealer_short FROM "cot_reports" WHERE id = 'cftc:XAUUSD:2026-01-01'`);
    expect(Number(rows[0]?.dealer_long)).toBe(largeValue);
    expect(Number(rows[0]?.dealer_short)).toBe(largeValue);
  });

  it('cot_reports columns have bigint data type', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0028_phase2_data_integrity');
    const { rows } = await db.execute(`SELECT data_type FROM information_schema.columns WHERE table_name = 'cot_reports' AND column_name = 'dealer_long'`);
    expect(rows[0]?.data_type).toBe('bigint');
  });
});

describe('Phase 3 — schema fixes (migration 0029)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hamafx-phase3-'));
  });

  afterEach(async () => {
    await closePGliteDb();
  });

  it('memory_embeddings has unique constraint on (user_id, kind, source_id)', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0029_phase3_schema_fixes');
    const { rows } = await db.execute(`SELECT conname FROM pg_constraint WHERE conrelid = '"memory_embeddings"'::regclass AND contype = 'u'`);
    const names = rows.map((r: Record<string, unknown>) => r.conname);
    expect(names).toContain('memory_embeddings_user_kind_source_uk');
    expect(names).not.toContain('memory_embeddings_kind_source_uk');
  });

  it('memory_embeddings allows same (kind, source_id) for different users', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0029_phase3_schema_fixes');
    await db.execute(`INSERT INTO "user" (id, email) VALUES ('u-mem-a', 'a@localhost')`);
    await db.execute(`INSERT INTO "user" (id, email) VALUES ('u-mem-b', 'b@localhost')`);
    await db.execute(`INSERT INTO "memory_embeddings" (user_id, kind, source_id, text, model, embedding, occurred_at) VALUES ('u-mem-a', 'journal', 'src-1', 'text A', 'openai/text-embedding-3-small', ARRAY[0.1, 0.2], now())`);
    await db.execute(`INSERT INTO "memory_embeddings" (user_id, kind, source_id, text, model, embedding, occurred_at) VALUES ('u-mem-b', 'journal', 'src-1', 'text B', 'openai/text-embedding-3-small', ARRAY[0.3, 0.4], now())`);
    const { rows } = await db.execute(`SELECT count(*)::int as cnt FROM "memory_embeddings" WHERE kind = 'journal' AND source_id = 'src-1'`);
    expect(rows[0]?.cnt).toBe(2);
  });

  it('memory_embeddings rejects duplicate (user_id, kind, source_id)', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0029_phase3_schema_fixes');
    await db.execute(`INSERT INTO "user" (id, email) VALUES ('u-mem-c', 'c@localhost')`);
    await db.execute(`INSERT INTO "memory_embeddings" (user_id, kind, source_id, text, model, embedding, occurred_at) VALUES ('u-mem-c', 'journal', 'src-2', 'text', 'openai/text-embedding-3-small', ARRAY[0.1], now())`);
    await expect(
      db.execute(`INSERT INTO "memory_embeddings" (user_id, kind, source_id, text, model, embedding, occurred_at) VALUES ('u-mem-c', 'journal', 'src-2', 'text dup', 'openai/text-embedding-3-small', ARRAY[0.2], now())`),
    ).rejects.toThrow();
  });

  it('snapshots has unique constraint on (symbol, kind, as_of)', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0029_phase3_schema_fixes');
    const { rows } = await db.execute(`SELECT conname FROM pg_constraint WHERE conrelid = '"snapshots"'::regclass AND contype = 'u'`);
    const names = rows.map((r: Record<string, unknown>) => r.conname);
    expect(names).toContain('snapshots_symbol_kind_asof_uk');
  });

  it('snapshots rejects duplicate (symbol, kind, as_of)', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0029_phase3_schema_fixes');
    await db.execute(`INSERT INTO "snapshots" (symbol, kind, as_of, data) VALUES ('XAUUSD', 'daily', '2026-01-01', '{}'::jsonb)`);
    await expect(
      db.execute(`INSERT INTO "snapshots" (symbol, kind, as_of, data) VALUES ('XAUUSD', 'daily', '2026-01-01', '{}'::jsonb)`),
    ).rejects.toThrow();
  });

  it('snapshots allows same symbol with different kind/as_of', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0029_phase3_schema_fixes');
    await db.execute(`INSERT INTO "snapshots" (symbol, kind, as_of, data) VALUES ('XAUUSD', 'daily', '2026-01-01', '{}'::jsonb)`);
    await db.execute(`INSERT INTO "snapshots" (symbol, kind, as_of, data) VALUES ('XAUUSD', 'weekly', '2026-01-01', '{}'::jsonb)`);
    await db.execute(`INSERT INTO "snapshots" (symbol, kind, as_of, data) VALUES ('XAUUSD', 'daily', '2026-01-02', '{}'::jsonb)`);
    const { rows } = await db.execute(`SELECT count(*)::int as cnt FROM "snapshots" WHERE symbol = 'XAUUSD'`);
    expect(rows[0]?.cnt).toBe(3);
  });

  it('agent_opinions has standard-named indexes', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0029_phase3_schema_fixes');
    const { rows } = await db.execute(`SELECT indexname FROM pg_indexes WHERE tablename = 'agent_opinions' ORDER BY indexname`);
    const names = rows.map((r: Record<string, unknown>) => r.indexname);
    expect(names).toContain('agent_opinions_thread_idx');
    expect(names).toContain('agent_opinions_user_created_idx');
    expect(names).not.toContain('idx_agent_opinions_thread');
    expect(names).not.toContain('idx_agent_opinions_user_created');
  });

  it('chat_telemetry_user_id_idx has been dropped', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0029_phase3_schema_fixes');
    const { rows } = await db.execute(`SELECT indexname FROM pg_indexes WHERE tablename = 'chat_telemetry' AND indexname = 'chat_telemetry_user_id_idx'`);
    expect(rows).toHaveLength(0);
  });

  it('chat_telemetry still has telemetry_user_created_idx composite', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0029_phase3_schema_fixes');
    const { rows } = await db.execute(`SELECT indexname FROM pg_indexes WHERE tablename = 'chat_telemetry' AND indexname = 'telemetry_user_created_idx'`);
    expect(rows).toHaveLength(1);
  });

  it('decision_signal_outcomes has evaluated_at index', async () => {
    const db = await getPGliteDb(dir);
    await applyAllThrough(db, '0029_phase3_schema_fixes');
    const { rows } = await db.execute(`SELECT indexname FROM pg_indexes WHERE tablename = 'decision_signal_outcomes' AND indexname = 'decision_signal_outcomes_evaluated_idx'`);
    expect(rows).toHaveLength(1);
  });
});
