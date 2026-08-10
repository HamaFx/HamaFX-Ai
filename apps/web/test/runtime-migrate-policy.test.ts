// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(process.cwd(), '../../packages/db/drizzle/0038_phase3_rls_cutover.sql');
const runtimeMigratorPath = resolve(process.cwd(), 'scripts/migrate-runtime.mjs');

function extractEnabledTables(sql: string): string[] {
  return [...sql.matchAll(/ALTER TABLE\s+([a-z0-9_]+)\s+ENABLE ROW LEVEL SECURITY/gi)].map(
    (match) => match[1]!,
  );
}

describe('runtime migration single-user policy', () => {
  it('disables every table that the RLS cutover migration enables', () => {
    const rlsMigration = readFileSync(migrationPath, 'utf8');
    const runtimeMigrator = readFileSync(runtimeMigratorPath, 'utf8');
    const enabledTables = extractEnabledTables(rlsMigration);

    for (const table of enabledTables) {
      expect(runtimeMigrator).toContain(`'${table}'`);
    }
  });

  it('requires privileged table ownership for post-migration RLS cleanup', () => {
    const runtimeMigrator = readFileSync(runtimeMigratorPath, 'utf8');
    expect(runtimeMigrator).toContain('ALTER TABLE');
    expect(runtimeMigrator).toContain('DISABLE ROW LEVEL SECURITY');
  });

  it('preflights unsupported flags before opening the database client', () => {
    const runtimeMigrator = readFileSync(runtimeMigratorPath, 'utf8');
    const preflightIndex = runtimeMigrator.indexOf('const multiUserEnabled');
    expect(runtimeMigrator).toContain("registrationMode === 'open'");
    const clientIndex = runtimeMigrator.indexOf('const sql = postgres(');

    expect(preflightIndex).toBeGreaterThan(-1);
    expect(clientIndex).toBeGreaterThan(-1);
    expect(preflightIndex).toBeLessThan(clientIndex);
  });
});
