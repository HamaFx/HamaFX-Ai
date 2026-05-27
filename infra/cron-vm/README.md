# HamaFX-Ai Cron VM

A lightweight GCE `e2-small` instance that fires all cron endpoints on schedule via `curl`. Replaces GitHub Actions (which requires billing) and Vercel Cron (which caps at once/day on Hobby).

## Instance details

| Property | Value |
|----------|-------|
| Name | `hamafx-cron` |
| Project | `hamafx-78845` |
| Zone | `us-central1-a` |
| Machine type | `e2-small` (2 vCPU, 2 GB RAM) |
| OS | Ubuntu 24.04 LTS Minimal |
| Disk | 10 GB pd-standard |
| External IP | Ephemeral (check `gcloud compute instances describe hamafx-cron --zone=us-central1-a --format='get(networkInterfaces[0].accessConfigs[0].natIP)'`) |
| Monthly cost | ~$6.11 (e2-small in us-central1, sustained use discount) |

## Schedule

| Endpoint | Cadence | Purpose |
|----------|---------|---------|
| `/api/cron/news` | Every 5 min | Marketaux news ingestion |
| `/api/cron/calendar` | Every 15 min | FRED calendar ingestion |
| `/api/cron/alerts` | Every 5 min | Alert evaluation + delivery |
| `/api/cron/briefings` | Every 5 min | Pre/post event briefings |
| `/api/cron/snapshots` | 00:05 UTC daily | Daily HLOC/pivots/ATR |
| `/api/cron/embedding-backfill` | Every 6 hours | News embedding computation |
| `/api/cron/fred-actuals` | 01:30 UTC daily | FRED actuals backfill |
| `/api/cron/weekly-review` | Sunday 18:00 UTC | Weekly journal review |
| `/api/cron/cot` | Friday 22:00 UTC | CFTC CoT ingestion |
| `/api/cron/warm-cache` | Every 2 min | Pre-fetches the most-used market data so first chat / chart load is hot (Phase 7a) |

## Setup / Update

```bash
# From the repo root:
gcloud compute scp infra/cron-vm/setup.sh hamafx-cron:/tmp/setup.sh --zone=us-central1-a --project=hamafx-78845
gcloud compute ssh hamafx-cron --zone=us-central1-a --project=hamafx-78845 --command="sudo bash /tmp/setup.sh"
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
# View recent logs
gcloud compute ssh hamafx-cron --zone=us-central1-a --command="tail -50 /var/log/hamafx-cron.log"

# Check cron is running
gcloud compute ssh hamafx-cron --zone=us-central1-a --command="systemctl status cron"

# View the schedule
gcloud compute ssh hamafx-cron --zone=us-central1-a --command="crontab -l"
```

## Cost optimization

- `e2-small` is in the GCP Always Free tier for the first 744 hours/month in us-central1 (but only for `e2-micro`). The `e2-small` costs ~$6.11/month with sustained use discount.
- To reduce to $0: downgrade to `e2-micro` (0.25 vCPU, 1 GB RAM) — more than enough for curl-based crons.
- The VM auto-updates via `unattended-upgrades` (Ubuntu default).

## Teardown

```bash
gcloud compute instances delete hamafx-cron --zone=us-central1-a --project=hamafx-78845 --quiet
```
