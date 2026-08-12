# Kestrel Disaster Recovery Playbook

> Read-only-first recovery procedures for the production worker VM.
> The active VM is `kestrel-cron` in GCP project
> `gen-lang-client-0103421645`, zone `us-central1-a`.
>
> Backblaze B2 setup is intentionally deferred. Until the operator creates the
> account and configures the VM, backup and restore timers remain installed but
> are skipped safely by `backup-storage-ready.sh`.

## Pre-flight

```bash
export PROJECT_ID="gen-lang-client-0103421645"
export ZONE="us-central1-a"
export VM="kestrel-cron"

# The following become available only after B2 is configured:
export B2_BUCKET="<configured-b2-bucket>"
```

Never print or commit `/opt/kestrel/.env`. It contains database credentials,
cron authentication, provider keys, and health-check IDs.

## Scenario 1 — Restore a database backup into a temporary database

After B2 is configured and a backup exists:

```bash
# 1. List recent dumps.
rclone lsl "kestrel:${B2_BUCKET}/db" | sort -k2 | tail -10

# 2. Download one dump locally.
LATEST=$(rclone lsf --files-only "kestrel:${B2_BUCKET}/db" | sort | tail -1)
rclone copyto "kestrel:${B2_BUCKET}/db/${LATEST}" /tmp/latest.dump.gz
gunzip -c /tmp/latest.dump.gz > /tmp/latest.dump

# 3. Start a throwaway PostgreSQL container.
docker run --rm -d --name kestrel-restore \
  -e POSTGRES_USER=verify -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=kestrel \
  -p 55432:5432 pgvector/pgvector:pg16
sleep 10

# 4. Restore and inspect only the temporary database.
PGPASSWORD=verify pg_restore --no-owner --no-privileges \
  -h 127.0.0.1 -p 55432 -U verify -d kestrel /tmp/latest.dump
PGPASSWORD=verify psql -h 127.0.0.1 -p 55432 -U verify -d kestrel \
  -c 'SELECT COUNT(*) FROM journal_entries;'
PGPASSWORD=verify psql -h 127.0.0.1 -p 55432 -U verify -d kestrel \
  -c 'SELECT COUNT(*) FROM chat_threads;'

# 5. Remove temporary files/container.
docker rm -f kestrel-restore
rm -f /tmp/latest.dump /tmp/latest.dump.gz
```

Do not restore over production unless there is an active incident, a verified
backup, and explicit operator approval. Production restore commands are
intentionally not automated here.

## Scenario 2 — Restore journal data for inspection

```bash
rclone copyto "kestrel:${B2_BUCKET}/journal/$(date -u +%Y-%m-%d).json" /tmp/journal.json
jq 'length' /tmp/journal.json
jq '.[0]' /tmp/journal.json
rm -f /tmp/journal.json
```

## Scenario 3 — Worker will not start

```bash
gcloud compute ssh "$VM" --zone="$ZONE" --project="$PROJECT_ID"
sudo docker ps -a
sudo docker inspect kestrel-worker --format '{{.State.Status}} {{.State.Health.Status}}'
sudo docker logs --tail 200 kestrel-worker
cat /opt/kestrel/.deployed-sha
```

The worker is a Docker container, not a `kestrel-worker.service` systemd unit.
The Docker Compose file forces `WORKER_MODE=docker`, so heavy jobs run through
the internal scheduler. Do not restore old heavy-job systemd timers; that could
run jobs twice.

The `kestrel-update.timer` normally pulls `origin/main`, rebuilds worker-
relevant changes, waits for Docker health, and rolls back an unhealthy image.

## Scenario 4 — Rebuild the worker from a known-good commit

Only use this during an incident and after recording the current SHA:

```bash
gcloud compute ssh "$VM" --zone="$ZONE" --project="$PROJECT_ID" \
  --command="sudo -u kestrel git -C /opt/kestrel/app fetch origin"
gcloud compute ssh "$VM" --zone="$ZONE" --project="$PROJECT_ID" \
  --command="sudo -u kestrel git -C /opt/kestrel/app reset --hard <known-good-sha>"
gcloud compute ssh "$VM" --zone="$ZONE" --project="$PROJECT_ID" \
  --command="sudo bash /opt/kestrel/scripts/deploy-worker.sh"
```

Push the fix to GitHub before unmasking the self-update timer, otherwise the
next update may replace the temporary pin.

## Scenario 5 — Recover the VM itself

If the VM is lost, create a replacement only after confirming the current
instance and disk cannot be recovered. Reuse the actual project and zone:

```bash
gcloud compute instances create kestrel-cron \
  --zone="$ZONE" --project="$PROJECT_ID" \
  --machine-type=e2-medium \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=48GB \
  --boot-disk-type=pd-standard
```

Then provision Docker, restore the operator-managed `/opt/kestrel/.env` with
mode `600`, deploy the worker, and verify the public health path. Do not place
that environment file in Secret Manager; manual recovery was selected.

## Scenario 6 — Recover `/opt/kestrel/.env` manually

The VM settings are intentionally not backed up to Secret Manager. Restore the
file from the operator's secure manual record:

```bash
sudo install -o kestrel -g kestrel -m 600 \
  /secure/operator-record/kestrel.env /opt/kestrel/.env
sudo systemctl daemon-reload
sudo docker compose -f /opt/kestrel/docker-compose.yml up -d --force-recreate worker
```

Verify only safe properties:

```bash
sudo stat -c '%U %G %a %n' /opt/kestrel/.env
sudo grep -E '^(PRODUCTION_URL|BACKUP_PROVIDER|B2_BUCKET)=' /opt/kestrel/.env \
  | sed -E 's/=.*/=<configured-or-empty>/'
```

## Scenario 7 — Configure B2 later

After creating the B2 account and restricted application key:

```bash
# Install rclone on the VM using the approved distribution package.
# Then add these values to /opt/kestrel/.env, without printing them:
BACKUP_PROVIDER=b2
B2_BUCKET=<private-bucket-name>
B2_KEY_ID=<restricted-application-key-id>
B2_APPLICATION_KEY=<restricted-application-key>
```

Configure B2 lifecycle cleanup for seven days and old file versions. Run the
backup scripts manually once, verify the uploaded objects, then allow the
backup timers to run. The restore rehearsal should pass only after a real
backup has been restored into a temporary database.

## Scenario 8 — Rotate CRON_SECRET

Always update Vercel first, then the VM. Never print the value in logs:

```bash
# Update CRON_SECRET in Vercel Production, deploy, then update the VM file.
gcloud compute ssh "$VM" --zone="$ZONE" --project="$PROJECT_ID" \
  --command="sudo sed -i 's/^CRON_SECRET=.*/CRON_SECRET=<new-value>/' /opt/kestrel/.env"
```

Restart the worker only if its environment uses the rotated value. Verify the
VM's authenticated cron calls through the systemd journal without exposing the
Authorization header.

## Weekly safety checks

- Tenant deletion rehearsal is dry-run only and refuses `__system__` safely.
- Tenant export rehearsal remains skipped until B2 is configured.
- Upload cleanup runs against Vercel and does not fail merely because its
  optional health-check ID is empty.
- Backup and restore timers remain skipped until B2 is configured.
- Docker worker health and SignalR tick freshness are checked continuously.
