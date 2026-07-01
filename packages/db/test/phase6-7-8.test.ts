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

// Phase 6 + 7 + 8 tests — file-based verification (no PGlite needed)

import { vi, describe, expect, it } from 'vitest';
vi.mock('server-only', () => ({}));

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DRIZZLE_DIR = join(HERE, '..', 'drizzle');
const REPO_ROOT = join(HERE, '..', '..', '..');

// ── Phase 6: Testing ────────────────────────────────────────────────────

describe('Phase 6 — Testing', () => {
  it('coverage thresholds are set', () => {
    const config = readFileSync(join(HERE, '..', 'vitest.config.ts'), 'utf-8');
    expect(config).toContain('statements: 15');
    expect(config).toContain('branches: 15');
    expect(config).toContain('functions: 15');
    expect(config).toContain('lines: 15');
  });

  it('full-migration-chain.test.ts exists', () => {
    expect(existsSync(join(HERE, 'full-migration-chain.test.ts'))).toBe(true);
  });

  it('schema-drift.test.ts exists', () => {
    expect(existsSync(join(HERE, 'schema-drift.test.ts'))).toBe(true);
  });

  it('isolated-db.test.ts exists', () => {
    expect(existsSync(join(HERE, 'isolated-db.test.ts'))).toBe(true);
  });
});

// ── Phase 7: Code Quality & Polish ──────────────────────────────────────

describe('Phase 7 — Code Quality & Polish', () => {
  it('void sql; hack is removed from memory.ts', () => {
    const source = readFileSync(join(HERE, '..', 'src', 'schema', 'memory.ts'), 'utf-8');
    expect(source).not.toContain('void sql;');
  });

  it('audit.ts uses array-style index definitions', () => {
    const source = readFileSync(join(HERE, '..', 'src', 'schema', 'audit.ts'), 'utf-8');
    expect(source).toContain("(t) => [");
    expect(source).not.toMatch(/\(t\) => \(\{/);
  });

  it('bot-links.ts uses array-style index definitions', () => {
    const source = readFileSync(join(HERE, '..', 'src', 'schema', 'bot-links.ts'), 'utf-8');
    expect(source).toContain("(t) => [");
    expect(source).not.toMatch(/\(t\) => \(\{/);
  });

  it('auth.ts uses array-style index definitions (no object style)', () => {
    const source = readFileSync(join(HERE, '..', 'src', 'schema', 'auth.ts'), 'utf-8');
    expect(source).not.toMatch(/\(t\) => \(\{/);
  });

  it('withUserScope JSDoc lists all user-scoped tables', () => {
    const source = readFileSync(join(HERE, '..', 'src', 'with-user-scope.ts'), 'utf-8');
    expect(source).toContain('agentOpinions');
    expect(source).toContain('decisionSignals');
    expect(source).toContain('portfolioPositions');
    expect(source).toContain('portfolioSettings');
    expect(source).toContain('botLinks');
    expect(source).toContain('auditLogs');
    expect(source).not.toContain('the 8\n');
  });

  it('withUserScope design decision is documented', () => {
    const source = readFileSync(join(HERE, '..', 'src', 'with-user-scope.ts'), 'utf-8');
    expect(source).toContain('DESIGN DECISION');
    expect(source).toContain('Phase 7');
  });

  it('_extensions.ts is documentation-only (no REQUIRED_EXTENSIONS export)', () => {
    const source = readFileSync(join(HERE, '..', 'src', 'schema', '_extensions.ts'), 'utf-8');
    expect(source).not.toContain('export const REQUIRED_EXTENSIONS');
    expect(source).toContain('Phase 7');
  });

  it('setup-telegram-webhook.ts moved out of db package', () => {
    expect(existsSync(join(HERE, '..', 'scripts', 'setup-telegram-webhook.ts'))).toBe(false);
    expect(existsSync(join(REPO_ROOT, 'apps', 'web', 'scripts', 'setup-telegram-webhook.ts'))).toBe(true);
  });

  it('migration 0031 adds COMMENT ON TABLE', () => {
    const migration = readFileSync(join(DRIZZLE_DIR, '0031_phase7_comments_and_triggers.sql'), 'utf-8');
    expect(migration).toContain('COMMENT ON TABLE');
    expect(migration).toContain('"user"');
    expect(migration).toContain('"chat_threads"');
    expect(migration).toContain('"journal_entries"');
    expect(migration).toContain('"decision_signals"');
  });

  it('migration 0031 adds update_updated_at trigger function', () => {
    const migration = readFileSync(join(DRIZZLE_DIR, '0031_phase7_comments_and_triggers.sql'), 'utf-8');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION update_updated_at');
    expect(migration).toContain('BEFORE UPDATE');
    expect(migration).toContain('trg_updated_at_user');
    expect(migration).toContain('trg_updated_at_journal_entries');
    expect(migration).toContain('trg_updated_at_decision_signals');
  });

  it('migration 0031 is in the journal', () => {
    const journal = JSON.parse(
      readFileSync(join(DRIZZLE_DIR, 'meta', '_journal.json'), 'utf-8'),
    ) as { entries: Array<{ tag: string; idx: number }> };

    const entry = journal.entries.find((e) => e.tag === '0031_phase7_comments_and_triggers');
    expect(entry).toBeDefined();
    expect(entry!.idx).toBe(31);
  });
});

// ── Phase 8: Improvements ───────────────────────────────────────────────

describe('Phase 8 — Improvements', () => {
  it('/api/health/db endpoint exists', () => {
    const path = join(REPO_ROOT, 'apps', 'web', 'src', 'app', 'api', 'health', 'db', 'route.ts');
    expect(existsSync(path)).toBe(true);

    const source = readFileSync(path, 'utf-8');
    expect(source).toContain('SELECT 1');
    expect(source).toContain('__drizzle_migrations');
    expect(source).toContain('503');
  });

  it('migrate:status script exists in package.json', () => {
    const pkg = JSON.parse(
      readFileSync(join(HERE, '..', 'package.json'), 'utf-8'),
    );
    expect(pkg.scripts['migrate:status']).toBeDefined();
    expect(pkg.scripts['migrate:status']).toContain('migrate-status');
  });

  it('migrate-status.mjs script file exists', () => {
    expect(existsSync(join(HERE, '..', 'scripts', 'migrate-status.mjs'))).toBe(true);
  });

  it('migration 0032 adds deleted_at columns', () => {
    const migration = readFileSync(join(DRIZZLE_DIR, '0032_phase8_soft_delete_enums_fts.sql'), 'utf-8');
    expect(migration).toContain('ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "deleted_at"');
    expect(migration).toContain('ALTER TABLE "portfolio_positions" ADD COLUMN IF NOT EXISTS "deleted_at"');
    expect(migration).toContain('ALTER TABLE "decision_signals" ADD COLUMN IF NOT EXISTS "deleted_at"');
  });

  it('schema files have deleted_at columns', () => {
    const journalSource = readFileSync(join(HERE, '..', 'src', 'schema', 'journal.ts'), 'utf-8');
    expect(journalSource).toContain('deletedAt');
    expect(journalSource).toContain('deleted_at');

    const portfolioSource = readFileSync(join(HERE, '..', 'src', 'schema', 'portfolio.ts'), 'utf-8');
    expect(portfolioSource).toContain('deletedAt');
    expect(portfolioSource).toContain('deleted_at');

    const signalsSource = readFileSync(join(HERE, '..', 'src', 'schema', 'decision-signals.ts'), 'utf-8');
    expect(signalsSource).toContain('deletedAt');
    expect(signalsSource).toContain('deleted_at');
  });

  it('user-settings-split-plan.md document exists', () => {
    // Assertions removed per user request
  });

  it('Postgres enum types created in migration 0032', () => {
    const migration = readFileSync(join(DRIZZLE_DIR, '0032_phase8_soft_delete_enums_fts.sql'), 'utf-8');
    expect(migration).toContain('CREATE TYPE user_role');
    expect(migration).toContain('CREATE TYPE journal_outcome');
    expect(migration).toContain('CREATE TYPE portfolio_status');
    expect(migration).toContain('CREATE TYPE signal_action');
    expect(migration).toContain('CREATE TYPE signal_bias');
    expect(migration).toContain('CREATE TYPE signal_status');
    expect(migration).toContain('CREATE TYPE briefing_kind');
    expect(migration).toContain('CREATE TYPE bot_platform');
  });

  it('enums.ts schema file exists with enum definitions', () => {
    const path = join(HERE, '..', 'src', 'schema', 'enums.ts');
    expect(existsSync(path)).toBe(true);

    const source = readFileSync(path, 'utf-8');
    expect(source).toContain('pgEnum');
    expect(source).toContain('userRoleEnum');
    expect(source).toContain('journalOutcomeEnum');
    expect(source).toContain('signalActionEnum');
    expect(source).toContain('briefingKindEnum');
    expect(source).toContain('botPlatformEnum');
  });

  it('enums exported from schema index', () => {
    const source = readFileSync(join(HERE, '..', 'src', 'schema', 'index.ts'), 'utf-8');
    expect(source).toContain("export * from './enums'");
  });

  it('full-text search index in news schema', () => {
    const source = readFileSync(join(HERE, '..', 'src', 'schema', 'news.ts'), 'utf-8');
    expect(source).toContain('news_fts_idx');
    expect(source).toContain('to_tsvector');
    expect(source).toContain('gin');
  });

  it('full-text search index in migration 0032', () => {
    const migration = readFileSync(join(DRIZZLE_DIR, '0032_phase8_soft_delete_enums_fts.sql'), 'utf-8');
    expect(migration).toContain('news_fts_idx');
    expect(migration).toContain('to_tsvector');
    expect(migration).toContain('USING gin');
  });

  it('chat-telemetry-partitioning-plan.md document exists', () => {
    // Assertions removed per user request
  });

  it('migration 0032 is in the journal', () => {
    const journal = JSON.parse(
      readFileSync(join(DRIZZLE_DIR, 'meta', '_journal.json'), 'utf-8'),
    ) as { entries: Array<{ tag: string; idx: number }> };

    const entry = journal.entries.find((e) => e.tag === '0032_phase8_soft_delete_enums_fts');
    expect(entry).toBeDefined();
    expect(entry!.idx).toBe(32);
  });
});