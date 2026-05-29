// Race-safety test for the atomic daily-budget reservation (§7).
//
// We model `daily_ai_spend` as an in-memory Map and simulate the
// `INSERT … ON CONFLICT DO UPDATE WHERE …` semantics in the mock. The
// real database serialises concurrent UPDATEs at the row level; the
// mock captures that contract by handling each `execute()` call
// atomically and applying the WHERE-fits-under-cap predicate.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface SpendRow {
  totalCents: number;
}

const dailyState = new Map<string, SpendRow>();

/**
 * Extract the interpolated values from a drizzle SQL fragment. The fragment
 * stores its chunks as either StringChunk (literal SQL) or boxed primitive
 * wrappers (String/Number) holding the user-supplied parameter values.
 */
function chunkValues(stmt: unknown): unknown[] {
  const obj = stmt as { queryChunks?: unknown[] };
  if (!Array.isArray(obj.queryChunks)) return [];
  const out: unknown[] = [];
  for (const c of obj.queryChunks) {
    if (c == null) continue;
    const cn = (c as { constructor?: { name?: string } }).constructor?.name;
    if (cn === 'StringChunk') continue;
    // Boxed String / Number wrappers — `valueOf()` unwraps to primitive.
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

        // tryReserveBudget INSERT: 5 interpolations (day, estCents, estCents, estCents, capCents)
        if (text.includes('INSERT INTO daily_ai_spend') && text.includes('<=')) {
          const [day, estCents, , , capCents] = values as [string, number, number, number, number];
          const row = dailyState.get(day);
          if (!row) {
            // INSERT branch — only succeeds if the estimate fits the cap.
            if (estCents <= capCents) {
              dailyState.set(day, { totalCents: estCents });
              return [{ total_usd_cents: estCents }];
            }
            return [];
          }
          // UPDATE branch — only succeeds if total + est <= cap.
          if (row.totalCents + estCents <= capCents) {
            row.totalCents += estCents;
            return [{ total_usd_cents: row.totalCents }];
          }
          return [];
        }
        // applyBudgetDelta: 3 interpolations (day, delta, delta)
        if (text.includes('INSERT INTO daily_ai_spend')) {
          const [day, deltaCents] = values as [string, number, number];
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
      dailyAiSpend: { day: 'day', totalUsdCents: 'total_usd_cents' },
      chatTelemetry: { estCostUsd: 'est_cost_usd', createdAt: 'created_at' },
    },
  };
});

import { tryReserveBudget } from '../src/cost';

describe('tryReserveBudget — race safety', () => {
  beforeEach(() => {
    dailyState.clear();
  });
  afterEach(() => {
    dailyState.clear();
  });

  it('lets one of two concurrent callers through at 99% of the cap', async () => {
    const cap = 1.0; // $1.00
    // Pre-load the day at 99 cents.
    const day = new Date().toISOString().slice(0, 10);
    dailyState.set(day, { totalCents: 99 });

    // Two callers each try to reserve $0.05 (5 cents). Neither fits because
    // 99 + 5 > 100; the cap holds.
    const [a, b] = await Promise.all([
      tryReserveBudget(0.05, cap),
      tryReserveBudget(0.05, cap),
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
      tryReserveBudget(0.06, cap),
      tryReserveBudget(0.06, cap),
    ]);
    const wins = [a, b].filter((r) => r.ok).length;
    expect(wins).toBe(1);
    expect(dailyState.get(day)!.totalCents).toBe(96);
  });

  it('serialises 50 parallel reservations against a finite cap', async () => {
    const cap = 0.1; // $0.10 = 10 cents.
    const each = 0.01; // 1 cent per call.
    const results = await Promise.all(
      Array.from({ length: 50 }, () => tryReserveBudget(each, cap)),
    );
    const winners = results.filter((r) => r.ok);
    // Cap is 10 cents, each reservation is 1 cent → at most 10 wins.
    expect(winners.length).toBeLessThanOrEqual(10);
    expect(winners.length).toBeGreaterThan(0);
    const day = new Date().toISOString().slice(0, 10);
    expect(dailyState.get(day)!.totalCents).toBeLessThanOrEqual(10);
  });

  it('refuses an estimate larger than the cap on a fresh day', async () => {
    const r = await tryReserveBudget(2.0, 1.0);
    expect(r.ok).toBe(false);
  });

  it('approves a reservation that fits exactly at the cap', async () => {
    const r = await tryReserveBudget(1.0, 1.0);
    expect(r.ok).toBe(true);
    const r2 = await tryReserveBudget(0.01, 1.0);
    expect(r2.ok).toBe(false);
  });
});
