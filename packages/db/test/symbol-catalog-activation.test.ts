/**
 * Copyright 2026 Kestrel
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

import { readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ALL_SYMBOLS, getSymbolDefinition } from '@kestrel/shared';
import {
  closePGliteDb,
  getPGliteDb,
  sanitizeStatement,
} from '../src/pglite-client';

const HERE = dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = join(HERE, '..', 'drizzle');
const MIGRATION = '0064_phase2_symbol_catalog_activation';

function stripComments(sql: string): string {
  const lines = sql.split('\n');
  while (lines.length > 0 && (lines[0]!.trim() === '' || lines[0]!.trim().startsWith('--'))) {
    lines.shift();
  }
  return lines.join('\n').trim();
}

async function applyMigration(
  db: Awaited<ReturnType<typeof getPGliteDb>>,
): Promise<void> {
  const source = readFileSync(join(DRIZZLE_DIR, `${MIGRATION}.sql`), 'utf8');
  for (const chunk of source.split('--> statement-breakpoint')) {
    const statement = sanitizeStatement(stripComments(chunk));
    if (!statement || statement.startsWith('--')) continue;
    try {
      await db.execute(statement);
    } catch (error) {
      const message = error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : error instanceof Error ? error.message : String(error);
      if (!message.includes('cannot insert multiple commands')) throw error;
      const raw = (await import('../src/pglite-client')).getRawPGlite();
      await raw.exec(statement);
    }
  }
}

describe('Phase 2 — canonical symbol catalog activation', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'hamafx-symbol-catalog-'));
  });

  afterEach(async () => {
    await closePGliteDb();
  });

  it('activates all canonical symbols and deactivates stale system rows', async () => {
    const db = await getPGliteDb(dataDir);
    await db.execute(`
      CREATE TABLE symbol_catalog (
        symbol text PRIMARY KEY NOT NULL,
        name text NOT NULL,
        category text NOT NULL,
        exchange text,
        tv_ticker text,
        biquote_symbol text,
        binance_symbol text,
        finnhub_symbol text,
        n_data_symbol text,
        pip_size real,
        price_decimals integer,
        currency_tags text[],
        is_active boolean DEFAULT true,
        sort_order integer DEFAULT 0,
        tenant_id text DEFAULT '__system__'
      )
    `);
    await db.execute(`INSERT INTO symbol_catalog (symbol, name, category, is_active, tenant_id) VALUES ('LEGACY', 'Legacy', 'forex', true, '__system__')`);

    await applyMigration(db);

    const { rows } = await db.execute(`
      SELECT symbol, category, biquote_symbol, binance_symbol, finnhub_symbol,
             price_decimals, is_active, sort_order, tenant_id
      FROM symbol_catalog
      ORDER BY sort_order, symbol
    `);
    const active = rows.filter((row: Record<string, unknown>) => row.is_active === true);
    expect(active).toHaveLength(ALL_SYMBOLS.length);
    expect(active.map((row: Record<string, unknown>) => row.symbol)).toEqual([...ALL_SYMBOLS]);

    for (const row of active as Array<Record<string, unknown>>) {
      const definition = getSymbolDefinition(String(row.symbol));
      expect(row).toMatchObject({
        category: definition.category,
        biquote_symbol: definition.biquote,
        binance_symbol: definition.binance,
        finnhub_symbol: definition.finnhub,
        price_decimals: definition.decimals,
        is_active: true,
        tenant_id: '__system__',
      });
    }

    const { rows: legacyRows } = await db.execute(
      `SELECT is_active FROM symbol_catalog WHERE symbol = 'LEGACY'`,
    );
    expect(legacyRows[0]?.is_active).toBe(false);
  });

  it('can be applied twice without changing the canonical result', async () => {
    const db = await getPGliteDb(dataDir);
    await db.execute(`
      CREATE TABLE symbol_catalog (
        symbol text PRIMARY KEY NOT NULL,
        name text NOT NULL,
        category text NOT NULL,
        exchange text,
        tv_ticker text,
        biquote_symbol text,
        binance_symbol text,
        finnhub_symbol text,
        n_data_symbol text,
        pip_size real,
        price_decimals integer,
        currency_tags text[],
        is_active boolean DEFAULT true,
        sort_order integer DEFAULT 0,
        tenant_id text DEFAULT '__system__'
      )
    `);

    await applyMigration(db);
    const first = await db.execute(
      `SELECT symbol, category, biquote_symbol, binance_symbol, finnhub_symbol, is_active, sort_order FROM symbol_catalog ORDER BY sort_order`,
    );
    await expect(applyMigration(db)).resolves.not.toThrow();
    const second = await db.execute(
      `SELECT symbol, category, biquote_symbol, binance_symbol, finnhub_symbol, is_active, sort_order FROM symbol_catalog ORDER BY sort_order`,
    );

    expect(second.rows).toEqual(first.rows);
  });
});
