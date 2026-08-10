// SPDX-License-Identifier: Apache-2.0

import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const workflow = readFileSync(resolve(root, '.github/workflows/docker-backup.yml'), 'utf8');
const smoke = readFileSync(resolve(root, 'docker/backup-restore-smoke.sh'), 'utf8');
const backupEntrypointPath = resolve(root, 'docker/backup-entrypoint.sh');
const rotation = readFileSync(resolve(root, 'packages/db/scripts/rotate-encryption-secret.mjs'), 'utf8');
const dbPackage = readFileSync(resolve(root, 'packages/db/package.json'), 'utf8');

describe('P3 production hardening policy', () => {
  it('runs a disposable Docker backup/restore workflow with cleanup', () => {
    expect(workflow).toContain('docker/init-secrets.sh');
    expect(workflow).toContain('docker/backup-restore-smoke.sh');
    expect(smoke).toContain('compose down --volumes --remove-orphans');
    expect(smoke).toContain('backup-db.sh --once');
    expect(smoke).not.toContain('backup sh /usr/local/bin/backup-db.sh');
    expect(smoke).toContain('HAMAFX_RESTORE_CONFIRM=YES');
    expect(smoke).toContain('[ "$marker" != \'before-backup\' ]');
    expect(smoke).toContain("POSTGRES_PUBLISHED_PORT='127.0.0.1:0'");
    expect(smoke).toContain('PROJECT_NAME="hamafx-backup-smoke-$$"');
    expect(statSync(backupEntrypointPath).mode & 0o777).toBe(0o755);
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
