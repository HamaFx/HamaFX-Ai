# HamaFX-Ai Cron VM

A lightweight GCE `e2-medium` instance that fires all cron endpoints on schedule via `curl`. Replaces GitHub Actions (which requires billing) and Vercel Cron (which caps at once/day on Hobby).

## Instance details

| Property | Value |
|----------|-------|
| Name | `hamafx-cron` |
| Project | `hamafx-78845` |
| Zone | `us-central1-a` |
| Machine type | `e2-medium` (2 vCPU, 4 GB RAM) |
| OS | Ubuntu 24.04 LTS Minimal |
| Disk | 10 GB pd-standard |
| External IP | Static (reserved via `gcloud compute addresses`) — see [Static IP](#static-ip) below |
| Monthly cost | ~$15-17 (e2-medium in us-central1, sustained use discount) |

## Firewall

The VM uses GCP default firewall rules (deny all inbound except SSH):
- **SSH (port 22):** allowed from 0.0.0.0/0
- **Port 8081:** NOT exposed externally — the health server binds to `127.0.0.1` only
- **No other inbound ports** are needed

Firewall rules are configured by `_provision.sh` during VM setup.

## Schedule

| Endpoint | Cadence | Purpose |
|----------|---------|---------|
| `/api/cron/news` | Every 5 min | Marketaux news ingestion |
| `/api/cron/calendar` | Every 15 min | FRED calendar ingestion |
| `/api/cron/alerts` | Every 5 min | Alert evaluation + delivery |
| `/api/cron/warm-cache` | Every 2 min | Pre-fetches the most-used market data so first chat / chart load is hot (Phase 7a) |
| **(worker)** `briefings` | Every 5 min | Pre/post event briefings (Phase 8 PR-10) |
| **(worker)** `snapshots` | 00:05 UTC daily | Daily HLOC/pivots/ATR + candles_1m prune (Phase 8 PR-11) |
| **(worker)** `embedding-backfill` | Every 6 hours | News embedding computation (Phase 8 PR-9) |
| **(worker)** `fred-actuals` | 01:30 UTC daily | FRED actuals backfill (Phase 8 PR-13) |
| **(worker)** `weekly-review` | Sunday 18:00 UTC | Weekly journal review (Phase 8 PR-14) |
| **(worker)** `cot` | Friday 22:00 UTC | CFTC CoT ingestion (Phase 8 PR-12) |

Phase 8 PR-15 — the legacy `cron` daemon is replaced by **systemd
timers**. All timers are driven from `infra/cron-vm/units/*`. The light
crons (top four rows above) still poke Vercel via curl. The heavy jobs
(rows tagged "(worker)") run as systemd `oneshot` services on the VM
itself; their Vercel route counterparts remain as manual-fallback paths.

## Setup / Update

```bash
# From the repo root — copies the entire cron-vm dir (units + setup.sh)
gcloud compute scp -r infra/cron-vm hamafx-cron:/tmp/hamafx-cron \
  --zone=us-central1-a --project=hamafx-78845
gcloud compute ssh hamafx-cron \
  --zone=us-central1-a --project=hamafx-78845 \
  --command="sudo bash /tmp/hamafx-cron/setup.sh"
```

## Environment

The VM reads `/opt/hamafx/.env` which must contain:

```bash
PRODUCTION_URL=https://hama-fx-ai.vercel.app
CRON_SECRET=<your-cron-secret>
```

To update the secret:
```bash
gcloud compute ssh hamafx-cron --zone=us-central1-a --project=hamafx-78845 --command="sudo tee /opt/hamafx/.env << EOF
PRODUCTION_URL=https://hama-fx-ai.vercel.app
CRON_SECRET=<new-secret>
EOF"
```

## Monitoring

```bash
# View recent journald output for any hamafx unit
gcloud compute ssh hamafx-cron --zone=us-central1-a \
  --command="sudo journalctl -u 'hamafx-*' -n 50 --no-pager"

# Show every active hamafx timer + when it next fires
gcloud compute ssh hamafx-cron --zone=us-central1-a \
  --command="systemctl list-timers --all 'hamafx-*' --no-pager"

# Tail the always-on worker
gcloud compute ssh hamafx-cron --zone=us-central1-a \
  --command="sudo journalctl -u hamafx-worker -f"
```

The legacy `tail /var/log/hamafx-cron.log` still works for any pre-PR-15
crontab activity, but every Phase 8+ run goes to journald.

## Cost optimization

- `e2-medium` costs ~$15-17/month with sustained use discount in us-central1. This was upgraded from `e2-small` (~$6/mo) on 2026-05-27 to give the worker (Phase 8) headroom for the always-on SignalR consumer plus burst capacity for embedding-backfill and weekly nightly `pg_dump`.
- The `e2-small` and `e2-micro` tiers are too small once the worker holds a persistent BiQuote SignalR connection — `e2-micro` (1 GB) is one bad embedding batch from OOMKill.
- The VM auto-updates via `unattended-upgrades` (Ubuntu default).

## GCS backup bucket — one-time setup (Phase 8 PR-17)

Backups land in a single-region `us-central1` GCS bucket so intra-region
egress from the VM stays free. 30-day retention for `db/`, 90-day for
`journal/`, both lifecycle-managed.

```bash
PROJECT_ID="hamafx-78845"
BUCKET="hamafx-backups-${PROJECT_ID}"

# Create the bucket. Single-region us-central1, uniform IAM, Standard class.
gcloud storage buckets create "gs://${BUCKET}" \
  --project="${PROJECT_ID}" \
  --location=us-central1 \
  --uniform-bucket-level-access \
  --default-storage-class=STANDARD

# Lifecycle policy.
cat > /tmp/lifecycle.yaml <<EOF
lifecycle:
  rule:
    - action: { type: Delete }
      condition: { age: 30, matchesPrefix: ['db/'] }
    - action: { type: Delete }
      condition: { age: 90, matchesPrefix: ['journal/'] }
EOF
gcloud storage buckets update "gs://${BUCKET}" --lifecycle-file=/tmp/lifecycle.yaml

# Grant the VM's default service account write-only access on this bucket.
SA=$(gcloud compute instances describe hamafx-cron \
  --zone=us-central1-a --project="${PROJECT_ID}" \
  --format='get(serviceAccounts[0].email)')
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${SA}" \
  --role=roles/storage.objectAdmin
```

After running the above, write `GCS_BACKUP_BUCKET=hamafx-backups-${PROJECT_ID}`
into `/opt/hamafx/.env`. The nightly `hamafx-backup-db.timer` and
`hamafx-backup-journal.timer` need it to know where to push.

## Disaster recovery

Concrete restore commands live in `infra/cron-vm/RECOVERY.md`.

## Static IP

The VM should use a **static external IP** so that:

- Outbound API calls (Vercel cron endpoints, healthchecks.io) come from a
  stable address — useful for allowlisting on upstream firewalls.
- If you ever need inbound access (SSH from a restricted IP range, a
  webhook receiver), the address doesn't change on reboot.

```bash
# Reserve a static IP (one-time)
gcloud compute addresses create hamafx-cron-ip \
  --region=us-central1 --project=hamafx-78845

# Attach it to the VM (requires the VM to be stopped briefly)
gcloud compute instances stop hamafx-cron --zone=us-central1-a --project=hamafx-78845
gcloud compute instances describe hamafx-cron \
  --zone=us-central1-a --project=hamafx-78845 \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)'
gcloud compute instances add-access-config hamafx-cron \
  --zone=us-central1-a --project=hamafx-78845 \
  --address=<RESERVED_IP> --network-tier=PREMIUM
gcloud compute instances start hamafx-cron --zone=us-central1-a --project=hamafx-78845
```

Cost: ~$3-4/month for a static IP attached to a running instance (free
while the instance is running, charged only when the IP is reserved but
unattached).

## Backup security

The nightly `pg_dump` and journal JSON exports land in a single GCS
bucket (`gs://hamafx-backups-*`). To protect against accidental or
malicious deletion if the VM is compromised:

1. **Enable GCS bucket versioning** so deleted objects can be restored:
   ```bash
   gcloud storage buckets update gs://hamafx-backups-hamafx-78845 \
     --versioning
   ```

2. **Add a retention lock** on the `db/` prefix so backups can't be
   deleted before the 30-day retention window expires:
   ```bash
   # Requires the bucket to have retention policy enabled
   gcloud storage buckets update gs://hamafx-backups-hamafx-78845 \
     --retention-period=30d
   ```

3. **Back up `/opt/hamafx/.env`** off the VM. If the VM is lost, all
   secrets (DATABASE_URL, CRON_SECRET, HC_* UUIDs, GCS bucket name)
   must be manually restored. Store a copy in GCP Secret Manager or a
   separate secure location:
   ```bash
   gcloud secrets create hamafx-vm-env --replication-policy=automatic
   gcloud secrets versions add hamafx-vm-env --data-file=/opt/hamafx/.env
   ```

## Teardown

```bash
gcloud compute instances delete hamafx-cron --zone=us-central1-a --project=hamafx-78845 --quiet
```
