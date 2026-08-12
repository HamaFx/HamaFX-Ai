// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const compose = readFileSync(resolve(root, 'docker-compose.yml'), 'utf8');
const backup = readFileSync(resolve(root, 'docker/backup-db.sh'), 'utf8');
const healthcheck = readFileSync(resolve(root, 'docker/backup-healthcheck.sh'), 'utf8');
const restore = readFileSync(resolve(root, 'docker/restore-db.sh'), 'utf8');
const loadtestCompose = readFileSync(resolve(root, 'loadtest/docker-compose.loadtest.yml'), 'utf8');
const loadtestWorkflow = readFileSync(resolve(root, '.github/workflows/loadtest.yml'), 'utf8');

describe('Docker-local backup policy', () => {
  it('keeps backups on a named volume and does not expose the backup worker', () => {
    expect(compose).toContain('backup-data:/var/lib/postgresql/backups');
    expect(compose).not.toContain('backup-data:/var/lib/hamafx/backups');
    const backupService = compose.split('  backup:\n')[1]?.split('\n  app:\n')[0] ?? '';
    expect(backupService).toContain('image: postgres:16-alpine');
    expect(backupService).toContain('entrypoint: ["/usr/local/bin/backup-entrypoint.sh"]');
    expect(readFileSync(resolve(root, 'docker/backup-entrypoint.sh'), 'utf8')).toContain('su-exec postgres');
    expect(backupService).not.toContain('ports:');
  });

  it('uses atomic compressed dumps and bounded retention', () => {
    expect(backup).toContain('--format=custom');
    expect(backup).toContain('| gzip > "$temporary"');
    expect(backup).toContain('mv -f "$temporary" "$destination"');
    expect(backup).toContain("-name '*.dump.gz'");
    expect(backup).toContain('RETENTION_DAYS');
  });

  it('fails health when no recent successful archive exists', () => {
    expect(healthcheck).toContain('"$BACKUP_DIR"/*.dump.gz');
    expect(healthcheck).toContain('no database backup found');
    expect(healthcheck).toContain('BACKUP_MAX_AGE_SECONDS');
    expect(healthcheck).toContain('latest backup is stale');
    expect(healthcheck).toContain('set -o pipefail');
    expect(healthcheck).toContain('pg_restore --list');
  });

  it('uses the unauthenticated health probe for container and load-test readiness', () => {
    expect(compose).toContain('curl -f http://localhost:3000/api/health/public');
    expect(compose).not.toContain('curl -f http://localhost:3000/api/health || exit 1');
    expect(loadtestCompose).toContain('/api/health/public');
    expect(loadtestCompose).not.toContain('curl -sf http://localhost:3000/api/health |');
    expect(loadtestWorkflow).toContain('/api/health/public');
  });

  it('requires an explicit destructive-restore confirmation', () => {
    expect(restore).toContain('KESTREL_RESTORE_CONFIRM');
    expect(restore).toContain('=YES');
    expect(restore).toContain('docker compose stop app worker backup');
    expect(restore).toContain('docker compose run --rm --no-deps backup');
    expect(restore).toContain('--clean --if-exists');
    expect(restore).toContain('docker compose start backup app worker');
  });
});
