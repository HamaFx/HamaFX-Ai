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

// CoT persistence — `upsertCoTReport`, `listCoTSamples`.
//
// Idempotent on the deterministic `(symbol, report_date)` PK encoded as
// `cftc:<symbol>:<YYYY-MM-DD>`, so the cron handler can re-run on the same
// week without producing duplicate rows.

import { schema } from '@hamafx/db';
import { getDb } from '../db';
import type { CoTSample, Symbol } from '@hamafx/shared';
import { and, desc, eq } from 'drizzle-orm';

export interface UpsertCoTReportArgs {
  symbol: Symbol;
  reportDate: Date;
  dealerLong: number | null;
  dealerShort: number | null;
  assetLong: number | null;
  assetShort: number | null;
  leveragedLong: number | null;
  leveragedShort: number | null;
  otherLong: number | null;
  otherShort: number | null;
  raw: unknown;
}

export function buildCoTId(symbol: Symbol, reportDate: Date): string {
  const iso = reportDate.toISOString().slice(0, 10);
  return `cftc:${symbol}:${iso}`;
}

export async function upsertCoTReport(args: UpsertCoTReportArgs): Promise<void> {
  const id = buildCoTId(args.symbol, args.reportDate);
  await getDb()
    .insert(schema.cotReports)
    .values({
      id,
      symbol: args.symbol,
      reportDate: args.reportDate,
      dealerLong: args.dealerLong,
      dealerShort: args.dealerShort,
      assetLong: args.assetLong,
      assetShort: args.assetShort,
      leveragedLong: args.leveragedLong,
      leveragedShort: args.leveragedShort,
      otherLong: args.otherLong,
      otherShort: args.otherShort,
      source: 'cftc',
      raw: args.raw as Record<string, unknown>,
    })
    .onConflictDoUpdate({
      target: schema.cotReports.id,
      set: {
        dealerLong: args.dealerLong,
        dealerShort: args.dealerShort,
        assetLong: args.assetLong,
        assetShort: args.assetShort,
        leveragedLong: args.leveragedLong,
        leveragedShort: args.leveragedShort,
        otherLong: args.otherLong,
        otherShort: args.otherShort,
        raw: args.raw as Record<string, unknown>,
      },
    });
}

export async function listCoTSamples(args: { symbol: Symbol; weeks: number }): Promise<CoTSample[]> {
  const rows = await getDb()
    .select()
    .from(schema.cotReports)
    .where(and(eq(schema.cotReports.symbol, args.symbol)))
    .orderBy(desc(schema.cotReports.reportDate))
    .limit(args.weeks);
  // The DB stores newest-first; flip to oldest-first so chart-like
  // consumers can read left-to-right without re-reversing.
  return rows
    .map((r) => ({
      reportDate: r.reportDate.getTime(),
      dealerLong: r.dealerLong,
      dealerShort: r.dealerShort,
      assetLong: r.assetLong,
      assetShort: r.assetShort,
      leveragedLong: r.leveragedLong,
      leveragedShort: r.leveragedShort,
      otherLong: r.otherLong,
      otherShort: r.otherShort,
    }))
    .reverse();
}

/** Diagnostic — total CoT rows in the table. */
export async function countCoTRows(): Promise<number> {
  const rows = await getDb().select({ id: schema.cotReports.id }).from(schema.cotReports).limit(1);
  return rows.length;
}
