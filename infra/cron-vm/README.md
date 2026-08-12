# Kestrel Cron VM

A GCE `e2-medium` instance that runs the Docker worker and fires lightweight cron endpoints on schedule via `curl`. It replaces GitHub Actions (which requires billing) and Vercel Cron (which caps at once/day on Hobby).

## Instance details

| Property | Value |
|----------|-------|
| Name | `kestrel-cron` |
| Project | `gen-lang-client-0103421645` |
| Zone | `us-central1-a` |
| Machine type | `e2-medium` (2 vCPU, 4 GB RAM) |
| OS | Ubuntu 24.04 LTS Minimal |
| Disk | 10 GB pd-standard |
| External IP | Currently ephemeral; reserve a static address only if stable allowlisting is needed |
| Monthly cost | ~$15-17 (e2-medium in us-central1, sustained use discount) |

## Firewall

The VM uses GCP default firewall rules (deny all inbound except SSH):
- **SSH (port 22):** allowed from 0.0.0.0/0
- **Port 8081:** NOT exposed externally — the health server binds to `127.0.0.1` only
- **No other inbound ports** are needed

Firewall rules are configured by `_provision-docker.sh` during VM setup.

> **BiQuote Proxy:** The worker's health server includes a BiQuote REST proxy
> at `/biquote/*`, but it is bound to `127.0.0.1` and only accessible from the
> VM itself. Vercel should go directly to `https://biquote.io` (the default
> `BIQUOTE_BASE_URL`). If you previously configured `BIQUOTE_BASE_URL` on Vercel
> to point to the VM, remove that override.

## Schedule

| Endpoint | Cadence | Purpose |
|----------|---------|---------|
| `/api/cron/news` | Every 5 min | Marketaux news ingestion |
| `/api/cron/calendar` | Every 15 min | FRED calendar ingestion |
| `/api/cron/alerts` | Every 5 min | Alert evaluation + delivery |
| `/api/cron/warm-cache` | Every 2 min | Pre-fetches the most-used market data so first chat / chart load is hot (Phase 7a) |
| `/api/cron/billing-dlq` | Every hour | Alerts on stale authenticated billing webhook failures |
| **(worker internal)** `briefings` | Every 5 min | Pre/post event briefings (Phase 8 PR-10) |
| **(worker internal)** `snapshots` | 00:05 UTC daily | Daily HLOC/pivots/ATR + candles_1m prune (Phase 8 PR-11) |
| **(worker internal)** `embedding-backfill` | Every 6 hours | News embedding computation (Phase 8 PR-9) |
| **(worker internal)** `fred-actuals` | 01:30 UTC daily | FRED actuals backfill (Phase 8 PR-13) |
| **(worker internal)** `weekly-review` | Sunday 18:00 UTC | Weekly journal review (Phase 8 PR-14) |
| **(worker internal)** `cot` | Friday 22:00 UTC | CFTC CoT ingestion (Phase 8 PR-12) |

Phase 8 PR-15 — the legacy `cron` daemon is replaced by **systemd timers**.
The light crons (top five rows above) still poke Vercel via curl. The heavy
jobs run inside the Docker worker's internal scheduler; their Vercel route
counterparts remain as manual-fallback paths. Do not restore separate heavy-job
systemd timers, because that would run jobs twice. The billing DLQ alert is
also a VM-managed light cron because Vercel Hobby does not support hourly
Vercel Cron schedules.

## Setup / Update

```bash
# From the repo root — stage the Docker provisioner and cron-vm files
gcloud compute scp -r infra/cron-vm kestrel-cron:/tmp/kestrel-cron \
  --zone=us-central1-a --project=gen-lang-client-0103421645
gcloud compute ssh kestrel-cron \
  --zone=us-central1-a --project=gen-lang-client-0103421645 \
  --command="sudo bash /tmp/kestrel-cron/_provision-docker.sh"
```

## Environment

The VM reads `/opt/kestrel/.env` which must contain:

```bash
PRODUCTION_URL=https://kestrel-ai.vercel.app
CRON_SECRET=<your-cron-secret>
```

To update the secret:
```bash
gcloud compute ssh kestrel-cron --zone=us-central1-a --project=gen-lang-client-0103421645 --command="sudo tee /opt/kestrel/.env << EOF
PRODUCTION_URL=https://kestrel-ai.vercel.app
CRON_SECRET=<new-secret>
EOF"
```

## Monitoring

The Docker worker is the always-on process. Use `docker logs` and the worker health endpoint for it; use `journalctl` for host timers and maintenance services.

```bash
# View recent journald output for any kestrel unit
gcloud compute ssh kestrel-cron --zone=us-central1-a \
  --command="sudo journalctl -u 'kestrel-*' -n 50 --no-pager"

# Show every active kestrel timer + when it next fires
gcloud compute ssh kestrel-cron --zone=us-central1-a \
  --command="systemctl list-timers --all 'kestrel-*' --no-pager"

# Tail the always-on worker
gcloud compute ssh kestrel-cron --zone=us-central1-a \
  --command="sudo docker logs -f --tail 200 kestrel-worker"
```

The legacy `tail /var/log/kestrel-cron.log` still works for any pre-PR-15
crontab activity, but every Phase 8+ run goes to journald.

## Cost optimization

- `e2-medium` costs ~$15-17/month with sustained use discount in us-central1. This was upgraded from `e2-small` (~$6/mo) on 2026-05-27 to give the worker (Phase 8) headroom for the always-on SignalR consumer plus burst capacity for embedding-backfill and weekly nightly `pg_dump`.
- The `e2-small` and `e2-micro` tiers are too small once the worker holds a persistent BiQuote SignalR connection — `e2-micro` (1 GB) is one bad embedding batch from OOMKill.
- The VM auto-updates via `unattended-upgrades` (Ubuntu default).

## Backup storage — Backblaze B2 setup is deferred

Backups are designed for a private Backblaze B2 bucket with seven-day retention.
The account and credentials are intentionally configured later. Until then, the
backup timers remain installed but are skipped safely by
`backup-storage-ready.sh`; they must not report false backup success.

When you are ready to connect B2, configure the VM with these values in
`/opt/kestrel/.env` and install `rclone`:

```bash
BACKUP_PROVIDER=b2
B2_BUCKET=<private-bucket-name>
B2_KEY_ID=<restricted-application-key-id>
B2_APPLICATION_KEY=<restricted-application-key>
```

Create a B2 lifecycle rule that keeps seven days and removes older files and
old file versions. The backup scripts use dated paths under `db/`, `journal/`,
and `tenant-exports/`. The B2 setup is deliberately not performed by the
provisioner until the account exists.

## Disaster recovery

Concrete restore commands live in `infra/cron-vm/RECOVERY.md`.

## Static IP

If stable allowlisting is needed, the VM can use a **static external IP** so that:

- Outbound API calls (Vercel cron endpoints, healthchecks.io) come from a
  stable address — useful for allowlisting on upstream firewalls.
- If you ever need inbound access (SSH from a restricted IP range, a
  webhook receiver), the address doesn't change on reboot.

```bash
# Reserve a static IP (one-time)
gcloud compute addresses create kestrel-cron-ip \
  --region=us-central1 --project=gen-lang-client-0103421645

# Attach it to the VM (requires the VM to be stopped briefly)
gcloud compute instances stop kestrel-cron --zone=us-central1-a --project=gen-lang-client-0103421645
gcloud compute instances describe kestrel-cron \
  --zone=us-central1-a --project=gen-lang-client-0103421645 \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)'
gcloud compute instances add-access-config kestrel-cron \
  --zone=us-central1-a --project=gen-lang-client-0103421645 \
  --address=<RESERVED_IP> --network-tier=PREMIUM
gcloud compute instances start kestrel-cron --zone=us-central1-a --project=gen-lang-client-0103421645
```

Cost and availability depend on the active GCP billing account. The current
VM audit did not find a reserved static address, so do not assume the current
IP is permanent.

## Backup security and recovery

The nightly database and journal exports use a private B2 bucket once the
operator configures it. Keep the bucket private, restrict the application key
to that bucket, and configure lifecycle cleanup for seven days plus old file
versions. VM recovery settings remain manual by choice; do not place the VM
environment file in Secret Manager.

## Teardown

```bash
gcloud compute instances delete kestrel-cron  --zone=us-central1-a --project=gen-lang-client-0103421645 --quiet
```
