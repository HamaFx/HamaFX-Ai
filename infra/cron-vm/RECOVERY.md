# HamaFX-Ai Disaster Recovery Playbook

> Phase 8 PR-17 deliverable. Concrete commands for recovering each
> failure mode from §6 of `docs/superpowers/specs/2026-05-27-phase-8-backend-reliability-design.md`.
>
> If you're reading this in the middle of an incident, jump to the
> matching scenario, run the commands, and document anything you had to
> change in the corresponding `infra/cron-vm/` doc afterwards.

## Pre-flight

All commands assume:

- `gcloud` configured against project `hamafx-78845`.
- `gsutil` available locally (`gcloud components install gsutil` or use
  the apt-installed `google-cloud-cli`).
- A working laptop / VM with `psql` + `pg_restore` (PostgreSQL 15 client
  is enough; the dump format is forward-compatible).
- The Supabase pooler URL in your shell as `DATABASE_URL`.

```bash
export PROJECT_ID="hamafx-78845"
export GCS_BUCKET="hamafx-backups-${PROJECT_ID}"
export DATABASE_URL="postgres://...pooler.supabase.com:6543/postgres?pgbouncer=true&prepare=false"
```

## Scenario 1 — Restore the database from yesterday's backup

```bash
# 1. List the most recent dumps.
gsutil ls -l gs://${GCS_BUCKET}/db/ | sort -k2 | tail -10

# 2. Pull the dump locally.
LATEST=$(gsutil ls gs://${GCS_BUCKET}/db/ | sort | tail -1)
gsutil cp "$LATEST" /tmp/latest.dump.gz
gunzip /tmp/latest.dump.gz   # → /tmp/latest.dump

# 3. Boot a throwaway local Postgres so you can sanity-check before
#    pointing pg_restore at production.
docker run --rm -d --name hamafx-restore \
  -e POSTGRES_USER=verify -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=hamafx \
  -p 55432:5432 postgres:15-alpine
sleep 5

# 4. Restore + spot-check.
pg_restore --no-owner --no-privileges \
  -h 127.0.0.1 -p 55432 -U verify -d hamafx \
  /tmp/latest.dump
PGPASSWORD=verify psql -h 127.0.0.1 -p 55432 -U verify -d hamafx \
  -c 'SELECT COUNT(*) FROM journal_entries;'
PGPASSWORD=verify psql -h 127.0.0.1 -p 55432 -U verify -d hamafx \
  -c 'SELECT COUNT(*) FROM chat_threads;'

# 5. Once you've confirmed counts look right, replace production. ONLY
#    do this if you have an active incident and Supabase's own backups
#    are unrecoverable. Coordinate with Supabase support first.
pg_restore --no-owner --no-privileges --clean --if-exists \
  --dbname="$DATABASE_URL" \
  /tmp/latest.dump

# 6. Tear the local container down.
docker rm -f hamafx-restore
rm /tmp/latest.dump
```

## Scenario 2 — Restore journal-only from the JSON export

If pg_dump's custom format is broken or you need a human-readable
record of trades:

```bash
gsutil cp gs://${GCS_BUCKET}/journal/$(date -u +%Y-%m-%d).json /tmp/journal.json
# Inspect:
jq '. | length' /tmp/journal.json
jq '.[0]' /tmp/journal.json

# Re-import:
psql "$DATABASE_URL" <<'SQL'
CREATE TEMP TABLE staged_journal (j jsonb);
\COPY staged_journal FROM '/tmp/journal.json'
INSERT INTO journal_entries
SELECT
  (j->>'id')::uuid,
  j->>'symbol',
  j->>'side',
  -- map remaining fields verbatim …
FROM staged_journal
ON CONFLICT (id) DO NOTHING;
SQL
```

## Scenario 3 — Worker won't start

```bash
gcloud compute ssh hamafx-cron --zone=us-central1-a --project=$PROJECT_ID
# Inside the VM:
sudo journalctl -u hamafx-worker -n 100 --no-pager
sudo systemctl status hamafx-worker
cat /opt/hamafx/.deployed-sha
```

If a bad commit is pinned, force a rebuild against a known-good SHA:

```bash
# Inside the VM, as `hamafx`:
sudo -u hamafx -i
cd /opt/hamafx/app
git fetch origin
git reset --hard <known-good-sha>
pnpm install --frozen-lockfile
pnpm --filter @hamafx/worker build
echo <known-good-sha> > /opt/hamafx/.deployed-sha
exit
sudo systemctl restart hamafx-worker
```

The 5-minute self-update timer will overwrite this on the next tick if
`origin/main` differs — push the fix to `main` first, or temporarily
mask the timer:

```bash
sudo systemctl mask hamafx-update.timer
# Investigate / patch / merge to main.
sudo systemctl unmask hamafx-update.timer
```

## Scenario 4 — Provision a fresh VM (start over)

If the existing `hamafx-cron` instance is broken beyond repair:

```bash
# 1. Snapshot the existing disk for forensics (optional).
gcloud compute disks snapshot hamafx-cron \
  --zone=us-central1-a --project=$PROJECT_ID \
  --snapshot-names="hamafx-cron-pre-recovery-$(date -u +%Y%m%d)"

# 2. Create a new instance. Use the same name to keep DNS / scripts
#    pointing at the right place.
gcloud compute instances delete hamafx-cron \
  --zone=us-central1-a --project=$PROJECT_ID --quiet
gcloud compute instances create hamafx-cron \
  --zone=us-central1-a --project=$PROJECT_ID \
  --machine-type=e2-medium \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=10GB \
  --boot-disk-type=pd-standard

# 3. Re-bootstrap.
gcloud compute scp -r infra/cron-vm hamafx-cron:/tmp/hamafx-cron \
  --zone=us-central1-a --project=$PROJECT_ID
gcloud compute ssh hamafx-cron --zone=us-central1-a --project=$PROJECT_ID \
  --command="sudo bash /tmp/hamafx-cron/setup.sh"

# 4. Restore /opt/hamafx/.env with all secrets (CRON_SECRET, DATABASE_URL,
#    GCS_BACKUP_BUCKET, every HC_* UUID). If you stored it in GCP Secret
#    Manager (see README.md → Backup security), retrieve it:
#      gcloud secrets versions access latest --secret=hamafx-vm-env > /opt/hamafx/.env
#      chmod 600 /opt/hamafx/.env
#    Re-deploy worker code:
gcloud compute ssh hamafx-cron --zone=us-central1-a --project=$PROJECT_ID \
  --command="sudo -u hamafx git clone https://github.com/HamaFx/HamaFX-Ai.git /opt/hamafx/app \
    && sudo -u hamafx pnpm -C /opt/hamafx/app install --frozen-lockfile \
    && sudo -u hamafx pnpm -C /opt/hamafx/app --filter @hamafx/worker build \
    && sudo systemctl restart hamafx-worker hamafx-update.timer"
```

## Scenario 5 — Revoke the VM service-account key

If a credential leaks:

```bash
SA="hamafx-cron@${PROJECT_ID}.iam.gserviceaccount.com"
# List keys
gcloud iam service-accounts keys list --iam-account=$SA --project=$PROJECT_ID
# Disable + delete the leaked one
gcloud iam service-accounts keys delete <KEY_ID> --iam-account=$SA --project=$PROJECT_ID
# Issue a new key (saved to ~/hamafx-cron-key.json)
gcloud iam service-accounts keys create ~/hamafx-cron-key.json \
  --iam-account=$SA --project=$PROJECT_ID
```

If `BIQUOTE_BASE_URL` ever requires a key, `CRON_SECRET` is the
analogue here — rotate it in Vercel envs first, then in
`/opt/hamafx/.env` on the VM.

## Health-check ground truth

A green dashboard at https://healthchecks.io/ with these checks recently
firing means everything is fine:

| Check | Cadence | UUID env |
|---|---|---|
| SignalR worker (always-on) | 30 s heartbeat | `HC_SIGNALR_UUID` |
| Self-update | every 5 min | `HC_UPDATE_UUID` |
| Light news poll | every 5 min | `HC_LIGHT_NEWS_UUID` |
| Light calendar poll | every 15 min | `HC_LIGHT_CALENDAR_UUID` |
| Light alerts poll | every 5 min | `HC_LIGHT_ALERTS_UUID` |
| Light warm-cache poll | every 2 min | `HC_LIGHT_WARM_CACHE_UUID` |
| Light cleanup-uploads | daily 03:00 UTC | `HC_CLEANUP_UPLOADS_UUID` |
| embedding-backfill | every 6 h | `HC_JOB_EMBEDDING_BACKFILL_UUID` |
| briefings | every 5 min | `HC_JOB_BRIEFINGS_UUID` |
| snapshots | daily 00:05 UTC | `HC_JOB_SNAPSHOTS_UUID` |
| cot | weekly Fri 22:00 UTC | `HC_JOB_COT_UUID` |
| fred-actuals | daily 01:30 UTC | `HC_JOB_FRED_ACTUALS_UUID` |
| weekly-review | weekly Sun 18:00 UTC | `HC_JOB_WEEKLY_REVIEW_UUID` |
| resonance-sync | daily 23:00 UTC | `HC_JOB_RESONANCE_SYNC_UUID` |
| db backup | daily 03:00 UTC | `HC_BACKUP_DB_UUID` |
| journal backup | daily 03:05 UTC | `HC_BACKUP_JOURNAL_UUID` |
| verify-restore | weekly Sun 04:00 UTC | `HC_VERIFY_RESTORE_UUID` |

`gs://${GCS_BUCKET}/verify/last-success.txt` is also written each Sunday
with the row counts from the most recent restore.
