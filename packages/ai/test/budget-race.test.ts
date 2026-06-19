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

// Race-safety test for the atomic daily-budget reservation (§7).
//
// Phase A: updated for per-user budget (tryReserveBudget now takes userId).
// The mock parses the new SQL format with (user_id, day) composite PK.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface SpendRow {
  totalCents: number;
}

const dailyState = new Map<string, SpendRow>();

function chunkValues(stmt: unknown): unknown[] {
  const obj = stmt as { queryChunks?: unknown[] };
  if (!Array.isArray(obj.queryChunks)) return [];
  const out: unknown[] = [];
  for (const c of obj.queryChunks) {
    if (c == null) continue;
    const cn = (c as { constructor?: { name?: string } }).constructor?.name;
    if (cn === 'StringChunk') continue;
    if (cn === 'String' || cn === 'Number' || cn === 'Boolean') {
      out.push((c as { valueOf: () => unknown }).valueOf());
    } else if (typeof c === 'object' && 'value' in (c as object)) {
      out.push((c as { value: unknown }).value);
    } else {
      out.push(c);
    }
  }
  return out;
}

vi.mock('@hamafx/db', () => {
  return {
    getDb: () => ({
      execute: vi.fn(async (statement: unknown) => {
        const chunks = ((statement as { queryChunks?: unknown[] })?.queryChunks ?? []) as unknown[];
        const text = chunks
          .map((c) => {
            const cn = (c as { constructor?: { name?: string } })?.constructor?.name;
            if (cn === 'StringChunk') {
              const v = (c as { value?: unknown }).value;
              if (Array.isArray(v)) return String(v[0] ?? '');
              return String(v ?? '');
            }
            return '?';
          })
          .join('');
        const values = chunkValues(statement);

        // tryReserveBudget INSERT: (userId, day, estCents, userId, day, estCents, estCents, capCents)
        if (text.includes('INSERT INTO daily_ai_spend') && text.includes('<=')) {
          // values: userId (0), day (1), estCents (2), estCents (3), estCents (4), capCents (5)
          const day = String(values[1]);
          const estCents = Number(values[2]);
          const capCents = Number(values[5]);
          const row = dailyState.get(day);
          if (!row) {
            if (estCents <= capCents) {
              dailyState.set(day, { totalCents: estCents });
              return [{ total_usd_cents: estCents }];
            }
            return [];
          }
          if (row.totalCents + estCents <= capCents) {
            row.totalCents += estCents;
            return [{ total_usd_cents: row.totalCents }];
          }
          return [];
        }
        // applyBudgetDelta: INSERT with GREATEST
        if (text.includes('INSERT INTO daily_ai_spend')) {
          const day = String(values[1]);
          const deltaCents = Number(values[2]);
          const row = dailyState.get(day);
          if (!row) {
            dailyState.set(day, { totalCents: Math.max(0, deltaCents) });
          } else {
            row.totalCents = Math.max(0, row.totalCents + deltaCents);
          }
          return [];
        }
        return [];
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([]),
          }),
        }),
      }),
    }),
    schema: {
      dailyAiSpend: { userId: 'user_id', day: 'day', totalUsdCents: 'total_usd_cents' },
      chatTelemetry: { userId: 'user_id', estCostUsd: 'est_cost_usd', createdAt: 'created_at' },
    },
  };
});

import { tryReserveBudget } from '../src/cost';

const TEST_USER = 'test-user';

describe('tryReserveBudget — race safety', () => {
  beforeEach(() => {
    dailyState.clear();
  });
  afterEach(() => {
    dailyState.clear();
  });

  it('lets one of two concurrent callers through at 99% of the cap', async () => {
    const cap = 1.0;
    const day = new Date().toISOString().slice(0, 10);
    dailyState.set(day, { totalCents: 99 });

    const [a, b] = await Promise.all([
      tryReserveBudget(TEST_USER, 0.05, cap),
      tryReserveBudget(TEST_USER, 0.05, cap),
    ]);
    const wins = [a, b].filter((r) => r.ok).length;
    expect(wins).toBe(0);
    expect(dailyState.get(day)!.totalCents).toBe(99);
  });

  it('lets exactly one of two concurrent callers through at 95% of the cap', async () => {
    const cap = 1.0;
    const day = new Date().toISOString().slice(0, 10);
    dailyState.set(day, { totalCents: 90 });

    const [a, b] = await Promise.all([
      tryReserveBudget(TEST_USER, 0.06, cap),
      tryReserveBudget(TEST_USER, 0.06, cap),
    ]);
    const wins = [a, b].filter((r) => r.ok).length;
    expect(wins).toBe(1);
    expect(dailyState.get(day)!.totalCents).toBe(96);
  });

  it('serialises 50 parallel reservations against a finite cap', async () => {
    const cap = 0.1;
    const each = 0.01;
    const results = await Promise.all(
      Array.from({ length: 50 }, () => tryReserveBudget(TEST_USER, each, cap)),
    );
    const winners = results.filter((r) => r.ok);
    expect(winners.length).toBeLessThanOrEqual(10);
    expect(winners.length).toBeGreaterThan(0);
    const day = new Date().toISOString().slice(0, 10);
    expect(dailyState.get(day)!.totalCents).toBeLessThanOrEqual(10);
  });

  it('refuses an estimate larger than the cap on a fresh day', async () => {
    const r = await tryReserveBudget(TEST_USER, 2.0, 1.0);
    expect(r.ok).toBe(false);
  });

  it('approves a reservation that fits exactly at the cap', async () => {
    const r = await tryReserveBudget(TEST_USER, 1.0, 1.0);
    expect(r.ok).toBe(true);
    const r2 = await tryReserveBudget(TEST_USER, 0.01, 1.0);
    expect(r2.ok).toBe(false);
  });
});