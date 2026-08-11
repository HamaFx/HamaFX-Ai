// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('cron VM operational policy', () => {
  it('defers backup jobs until B2 is configured and never uses the retired GCS path', () => {
    const adapter = read('infra/cron-vm/scripts/backup-storage.sh');
    const ready = read('infra/cron-vm/scripts/backup-storage-ready.sh');
    const db = read('infra/cron-vm/scripts/backup-db.sh');
    const journal = read('infra/cron-vm/scripts/backup-journal.sh');
    const restore = read('infra/cron-vm/scripts/verify-restore.sh');

    expect(adapter).toContain('B2_BUCKET');
    expect(adapter).toContain('rclone');
    expect(ready).toContain('backup_storage_available');
    expect(db).toContain('backup_storage_upload_stream');
    expect(journal).toContain('backup_storage_upload_stream');
    expect(restore).toContain('backup_storage_latest_db');
    expect(db).not.toContain('gcloud storage');
    expect(journal).not.toContain('gcloud storage');
    expect(restore).not.toContain('gcloud storage');
  });

  it('skips backup-dependent systemd units until B2 is ready', () => {
    for (const unit of [
      'infra/cron-vm/units/hamafx-backup-db.service',
      'infra/cron-vm/units/hamafx-backup-journal.service',
      'infra/cron-vm/units/hamafx-verify-restore.service',
      'infra/cron-vm/units/hamafx-tenant-export.service',
    ]) {
      expect(read(unit), unit).toContain('ExecCondition=/opt/hamafx/scripts/backup-storage-ready.sh');
    }
  });

  it('keeps tenant deletion rehearsal dry-run and protects the system account', () => {
    const script = read('infra/cron-vm/scripts/delete-tenant.sh');
    const unit = read('infra/cron-vm/units/hamafx-tenant-delete.service');

    expect(unit).toContain('delete-tenant.sh __system__');
    expect(unit).toMatch(/ExecStart=\/opt\/hamafx\/scripts\/delete-tenant\.sh __system__(?:\n|$)/);
    expect(script).toContain('SAFETY CHECK PASSED');
    expect(script).toContain('chat_messages WHERE thread_id');
    expect(script).toContain('analysis_jobs');
    expect(script).toContain('diagnostic_traces');
    expect(script).not.toMatch(/FROM chat_messages[^\n]*\.user_id/);
    expect(script).not.toContain('SELECT COUNT(*) FROM chat_messages WHERE user_id');
    expect(script).not.toContain('DELETE FROM chat_messages WHERE user_id');
  });

  it('exports relationship-owned chat messages without querying a missing user_id column', () => {
    const script = read('infra/cron-vm/scripts/export-tenant.sh');

    expect(script).toContain("'chat_messages'::text");
    expect(script).toContain('JOIN chat_threads th ON th.id = t.thread_id');
    expect(script).not.toMatch(/FROM chat_messages t WHERE t\.user_id/);
    expect(script).toContain('analysis_jobs');
    expect(script).toContain('diagnostic_traces');
  });

  it('keeps heavy jobs in the Docker scheduler instead of restoring deleted timers', () => {
    const compose = read('infra/cron-vm/docker-compose.vm.yml');
    const provisioner = read('infra/cron-vm/_provision-docker.sh');
    const readme = read('infra/cron-vm/README.md');

    expect(compose).toContain('WORKER_MODE: docker');
    expect(provisioner).toContain('reduced set — no heavy job timers');
    expect(readme).toContain("Docker worker's internal scheduler");
    expect(readme).toContain('Do not restore separate heavy-job');
  });

  it('installs and protects the host systemd synchronization path', () => {
    const helper = read('infra/cron-vm/scripts/sync-systemd-units.sh');
    const provisioner = read('infra/cron-vm/_provision-docker.sh');
    const update = read('infra/cron-vm/scripts/docker-update.sh');
    const sudoers = read('infra/cron-vm/sudoers.d/hamafx');

    expect(helper).toContain("TARGET_DIR='/etc/systemd/system'");
    expect(helper).toContain('! -L "$source"');
    expect(helper).toContain('MANAGED_UNITS');
    expect(provisioner).toContain('/usr/local/sbin/hamafx-sync-systemd-units');
    expect(update).toContain('/usr/local/sbin/hamafx-sync-systemd-units');
    expect(sudoers).toContain('/usr/local/sbin/hamafx-sync-systemd-units');
  });

  it('provisions the documented billing DLQ timer', () => {
    const provisioner = read('infra/cron-vm/_provision-docker.sh');
    const unit = read('infra/cron-vm/units/hamafx-billing-dlq.timer');

    expect(provisioner).toContain('hamafx-billing-dlq.timer');
    expect(unit).toContain('OnCalendar=hourly');
  });

  it('uses the live production project and hostname in operator docs', () => {
    const readme = read('infra/cron-vm/README.md');
    const deployment = read('docs/08-deployment.md');
    const lighthouse = read('tools/lighthouse/README.md');

    for (const content of [readme, deployment, lighthouse]) {
      expect(content).not.toContain('hama-fx-ai.vercel.app');
      expect(content).not.toContain('hamafx-78845');
    }
    expect(readme).toContain('gen-lang-client-0103421645');
    expect(deployment).toContain('gen-lang-client-0103421645');
    expect(deployment).toContain('hamafx-ai.vercel.app');
  });

  it('does not fail cleanup when its optional healthcheck ID is missing', () => {
    const unit = read('infra/cron-vm/units/hamafx-light-cleanup-uploads.service');
    expect(unit).toContain('test -z "$HC_CLEANUP_UPLOADS_UUID"');
  });
});
