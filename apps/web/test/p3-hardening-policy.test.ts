// SPDX-License-Identifier: Apache-2.0

import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const workflow = readFileSync(resolve(root, '.github/workflows/docker-backup.yml'), 'utf8');
const smoke = readFileSync(resolve(root, 'docker/backup-restore-smoke.sh'), 'utf8');
const backupEntrypointPath = resolve(root, 'docker/backup-entrypoint.sh');
const rotation = readFileSync(resolve(root, 'packages/db/scripts/rotate-encryption-secret.mjs'), 'utf8');
const loadtestWorkflow = readFileSync(resolve(root, '.github/workflows/loadtest.yml'), 'utf8');
const dbPackage = readFileSync(resolve(root, 'packages/db/package.json'), 'utf8');

describe('P3 production hardening policy', () => {
  it('runs a disposable Docker backup/restore workflow with cleanup', () => {
    expect(workflow).toContain('docker/init-secrets.sh');
    expect(workflow).toContain('docker/backup-restore-smoke.sh');
    expect(smoke).toContain('compose down --volumes --remove-orphans');
    expect(smoke).toContain('backup-db.sh --once');
    expect(smoke).not.toContain('backup sh /usr/local/bin/backup-db.sh');
    expect(smoke).toContain('KESTREL_RESTORE_CONFIRM=YES');
    expect(smoke).toContain('[ "$marker" != \'before-backup\' ]');
    expect(smoke).toContain("POSTGRES_PUBLISHED_PORT='127.0.0.1:0'");
    expect(smoke).toContain('PROJECT_NAME="kestrel-backup-smoke-$$"');
    expect(statSync(backupEntrypointPath).mode & 0o777).toBe(0o755);
  });

  it('builds compiled k6 scripts and inspects them fail-closed in CI', () => {
    const buildIndex = loadtestWorkflow.indexOf('name: Build k6 test scripts');
    const inspectIndex = loadtestWorkflow.indexOf('name: Inspect k6 test scripts (dry-run)');
    const runIndex = loadtestWorkflow.indexOf('uses: grafana/run-k6-action@v1');
    expect(buildIndex).toBeGreaterThanOrEqual(0);
    expect(inspectIndex).toBeGreaterThan(buildIndex);
    expect(runIndex).toBeGreaterThan(inspectIndex);
    expect(loadtestWorkflow).toContain('npm run build');
    expect(loadtestWorkflow).toContain('for f in dist/tests/*.js');
    expect(loadtestWorkflow).toContain('k6 inspect -e K6_ENABLE_CHAT=true "$f"');
    expect(loadtestWorkflow).not.toContain('for f in tests/*.ts');
    expect(loadtestWorkflow).not.toContain('k6 inspect "$f" 2>&1 || true');
    expect(loadtestWorkflow).toContain("default: 'loadtest/dist/tests/smoke-*.js'");
    expect(loadtestWorkflow).toContain('path: ${{ inputs.test || \'loadtest/dist/tests/smoke-*.js\' }}');
    expect(loadtestWorkflow).not.toContain('path: loadtest/tests/load-read-mix.ts');
    expect(loadtestWorkflow).not.toContain('path: loadtest/tests/load-write-mix.ts');
  });

  it('keeps the guarded chat scenario compatible with the pinned k6 schema', () => {
    const chatTest = readFileSync(resolve(root, 'loadtest/tests/load-chat.ts'), 'utf8');
    expect(chatTest).toContain("__ENV['K6_ENABLE_CHAT'] !== 'true'");
    expect(chatTest).not.toContain("name: 'load-chat'");
  });

  it('requires explicit, fail-closed encryption rotation inputs', () => {
    expect(rotation).toContain('OLD_ENCRYPTION_SECRET');
    expect(rotation).toContain('NEW_ENCRYPTION_SECRET');
    expect(rotation).toContain('ROTATE_ENCRYPTION_SECRET_CONFIRM');
    expect(rotation).toContain('ROTATE_ENCRYPTION_SECRET_MAINTENANCE');
    expect(rotation).toContain('STOP_WRITERS');
    expect(rotation).toContain("!== REQUIRED_CONFIRMATION");
    expect(rotation).toContain('await sql.begin');
    expect(rotation).toContain('cannot be decrypted with OLD_ENCRYPTION_SECRET');
    expect(rotation).toContain('user_settings');
    expect(rotation).toContain('two_factor_secret');
    expect(dbPackage).toContain('migrate:rotate-encryption');
  });
});
