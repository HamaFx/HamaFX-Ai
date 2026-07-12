# HamaFX-Ai — Docker VM Worker Deployment Plan (Build on VM, no GHCR/GitHub Actions)

> **Scope:** ONLY the GCE VM worker. Frontend (`apps/web`) stays on Vercel — untouched.
> **Constraint:** No GitHub Actions, no GHCR, no external container registry. The Docker image is built **on the VM** from the repo's `Dockerfile.worker`.
> **Base:** commit `3855e93`
> **Date:** 2026-07-12

---

## What Changes (VM only)

| Component | Current (bare-metal) | New (Docker, build on VM) |
|-----------|---------------------|--------------------------|
| Worker process | `node dist/index.js` via systemd | Docker container built from `Dockerfile.worker` |
| Heavy jobs (8) | 8 systemd timers → 8 CLI processes | Internal node-cron inside container (`WORKER_MODE=docker`) |
| Self-update | `git pull + pnpm install + pnpm build + restart` | `git pull + docker compose build + up -d` |
| Host dependencies | Node.js 20, pnpm 9, repo checkout, build tools | Docker + git only (Node/pnpm live inside Docker build stages) |
| systemd units | 20 timers + 21 services | 12 timers + 12 services |
| Rollback | `git reset + pnpm install + pnpm build` (30-90s) | `git reset + docker compose build + up -d` (or tag swap if cached) |
| Crash recovery | systemd `Restart=always` | Docker `restart: unless-stopped` + autoheal timer |
| Health monitoring | sd_notify WATCHDOG | Docker healthcheck + autoheal timer + healthchecks.io |
| External registry | N/A | **None — image built locally on VM** |

## What Stays Unchanged

- **Frontend (apps/web)** — stays on Vercel, zero changes
- **Supabase Postgres** — external, worker connects to it
- **Light crons (5)** — stay as systemd timers (curl to Vercel)
- **Backups (2)** — stay as systemd timers (pg_dump + gsutil on host)
- **verify-restore** — stays as systemd timer (Docker-in-Docker on host)
- **Tenant ops (2)** — stay as systemd timers (psql + gsutil on host)
- **disk-check, docker-prune** — stay as systemd timers
- **All env vars** — same `/opt/hamafx/.env`, passed via `env_file`
- **All DB tables, data flows, connections** — unchanged

---

## Table of Contents

1. [Architecture Diagram](#1-architecture-diagram)
2. [Dockerfile.worker Changes](#2-dockerfileworker-changes)
3. [New Files](#3-new-files)
4. [Modified Files](#4-modified-files)
5. [Deleted Files](#5-deleted-files)
6. [Boot / Shutdown / Crash Recovery](#6-boot--shutdown--crash-recovery)
7. [Self-Update Flow](#7-self-update-flow)
8. [Data Flow Verification](#8-data-flow-verification)
9. [Migration Steps](#9-migration-steps)
10. [Rollback Plan](#10-rollback-plan)
11. [Verification Checklist](#11-verification-checklist)

---

## 1. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        GCE VM (hamafx-cron)                             │
│                        e2-medium, us-central1-a                         │
│                                                                         │
│  Host packages: Docker, git, curl, postgresql-client, gsutil            │
│  NO Node.js, NO pnpm on host — they live inside Docker build stages     │
│                                                                         │
│  /opt/hamafx/                                                           │
│    ├── .env                    (secrets — same as before)               │
│    ├── docker-compose.yml      (VM-specific, builds from repo)          │
│    ├── scripts/                (backup, update, autoheal, tenant ops)   │
│    ├── app/                    (git checkout — source for docker build) │
│    └── .autoheal-state         (autoheal counter)                       │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ Docker daemon (systemctl enable docker)                          │  │
│  │                                                                   │  │
│  │  ┌─────────────────────────────────────────────────────────────┐ │  │
│  │  │ Container: hamafx-worker                                     │ │  │
│  │  │ Built from: /opt/hamafx/app/Dockerfile.worker                │ │  │
│  │  │ Restart: unless-stopped                                      │ │  │
│  │  │ Memory: 1.5GB limit   Stop grace: 30s                       │ │  │
│  │  │                                                               │ │  │
│  │  │  WORKER_MODE=docker → startScheduler() runs all 8 jobs:      │ │  │
│  │  │    alerts (1m), briefings (5m), embedding-backfill (6h),     │ │  │
│  │  │    snapshots (00:05), cot (Fri 22:00), fred-actuals (01:30), │ │  │
│  │  │    resonance-sync (23:00), weekly-review (Sun 18:00)         │ │  │
│  │  │                                                               │ │  │
│  │  │  Always-on:                                                   │ │  │
│  │  │    SignalR → BiQuote | Binance WS | TwelveData WS | MT5 TCP  │ │  │
│  │  │    1Hz flush → live_ticks | 1m candle agg → candles_1m       │ │  │
│  │  │    Health server :8081 | BiQuote proxy :8081/biquote/*       │ │  │
│  │  │    30s heartbeat → healthchecks.io                           │ │  │
│  │  │                                                               │ │  │
│  │  │  Ports (127.0.0.1 ONLY): 8081 (health), 8080 (MT5)          │ │  │
│  │  └─────────────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ systemd timers (12 — reduced from 20)                            │  │
│  │                                                                   │  │
│  │  Light crons (curl → Vercel):                                    │  │
│  │    news (5m), calendar (15m), alerts (5m),                       │  │
│  │    warm-cache (2m), cleanup-uploads (daily 03:00)                │  │
│  │                                                                   │  │
│  │  Infrastructure:                                                  │  │
│  │    update (5m) → git pull + docker compose build + up -d         │  │
│  │    backup-db (daily 03:00) → pg_dump | gsutil                    │  │
│  │    backup-journal (daily 03:05) → psql JSON | gsutil             │  │
│  │    verify-restore (Sun 04:00) → pg_restore in Docker             │  │
│  │    tenant-export (Sun 05:00) → psql JSON | gsutil                │  │
│  │    tenant-delete (Sun 05:30) → psql dry-run                      │  │
│  │    disk-check (hourly) → df check                                │  │
│  │    docker-prune (Sun 06:00) → docker image prune                 │  │
│  │    docker-autoheal (1m) → restart unhealthy container            │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌──────────────┐
│ Supabase        │  │ Vercel       │
│ (Postgres 16)   │  │ (apps/web)   │
│                 │  │ UNCHANGED    │
│ Worker writes:  │  │              │
│  live_ticks     │  │ Reads:       │
│  candles_1m     │  │  live_ticks  │
│  snapshots      │  │  candles_1m  │
│  cot_reports    │  │  snapshots   │
│  etc.           │  │  etc.        │
└─────────────────┘  └──────────────┘
```

---

## 2. Dockerfile.worker Changes

### File: `Dockerfile.worker`

Add `DEPLOYED_SHA` build arg so the container knows its commit. The rest is already correct — it's a multi-stage build that installs pnpm + Node inside Docker, so the host doesn't need them.

```dockerfile
FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json .npmrc ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/ai/package.json packages/ai/
COPY packages/config/package.json packages/config/
COPY packages/data/package.json packages/data/
COPY packages/db/package.json packages/db/
COPY packages/indicators/package.json packages/indicators/
COPY packages/shared/package.json packages/shared/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/pnpm-lock.yaml ./
COPY . .

RUN pnpm turbo run build --filter=@hamafx/worker...

# Prune development dependencies
RUN pnpm --filter=@hamafx/worker deploy --prod /prod/worker

FROM node:20-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /prod/worker ./

# Build arg → env var so the worker reports its commit SHA
ARG DEPLOYED_SHA=unknown
ENV DEPLOYED_SHA=${DEPLOYED_SHA}

ENV NODE_ENV=production
ENV WORKER_MODE=docker

EXPOSE 8081
EXPOSE 8080

CMD ["node", "dist/index.js"]
```

**Key point:** The `FROM base AS deps` stage installs pnpm and Node.js *inside Docker*. The host VM never needs Node.js or pnpm installed. Docker layer caching means the `deps` stage (the slowest part — `pnpm install`) is only rebuilt when `pnpm-lock.yaml` changes. Source-only changes rebuild in seconds.

---

## 3. New Files

### 3.1 `infra/cron-vm/docker-compose.vm.yml`

VM-specific Docker Compose — builds from the local repo, no external registry:

```yaml
# HamaFX-Ai VM Worker Docker Compose
# Deployed to /opt/hamafx/docker-compose.yml on the GCE VM.
# Builds the worker image from the repo's Dockerfile.worker — no external registry needed.
#
# The frontend (apps/web) runs on Vercel. Supabase is external.
# This container ONLY runs the worker + internal job scheduler.

services:
  worker:
    build:
      context: /opt/hamafx/app
      dockerfile: Dockerfile.worker
    image: hamafx-worker:local
    container_name: hamafx-worker
    restart: unless-stopped

    # All secrets from /opt/hamafx/.env
    env_file:
      - /opt/hamafx/.env

    # Hardcoded env vars (override any .env values)
    environment:
      NODE_ENV: production
      WORKER_MODE: docker
      HAMAFX_RUNTIME: worker

    # Ports bound to localhost ONLY — not accessible from the internet
    ports:
      - "127.0.0.1:8081:8081"   # Health server + BiQuote proxy
      - "127.0.0.1:8080:8080"   # MT5 bridge

    # No persistent volumes — all state lives in Supabase Postgres.
    # The worker is stateless: in-memory tick buffer + candle aggregator
    # are rebuilt from provider connections on restart.

    # Health check — replaces systemd WatchdogSec
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://localhost:8081/health || exit 1"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

    # Graceful shutdown — give the worker 30s to drain buffers + close WS
    stop_grace_period: 30s
    stop_signal: SIGTERM

    # Resource limits — matches current systemd MemoryMax=1.5G
    deploy:
      resources:
        limits:
          memory: 1.5g
          cpus: "1.5"
        reservations:
          memory: 256m

    # Log rotation — 50MB × 3 files = 150MB max
    logging:
      driver: "json-file"
      options:
        max-size: "50m"
        max-file: "3"
```

**Key difference from GHCR plan:** `build:` section instead of `image: ghcr.io/...`. The image is tagged `hamafx-worker:local` and built on the VM.

### 3.2 `infra/cron-vm/scripts/docker-update.sh`

Replaces `update.sh` — git pull, docker build, restart, health check, auto-rollback:

```bash
#!/usr/bin/env bash
# infra/cron-vm/scripts/docker-update.sh — Self-update via git pull + Docker build.
#
# Runs every 5 minutes via hamafx-update.timer. Compares the local
# checkout's HEAD to origin/main; if they differ:
#   1. git reset --hard origin/main
#   2. docker compose build (uses layer cache — fast when only source changes)
#   3. docker compose up -d --force-recreate (restart with new image)
#   4. 30s health check — auto-rollback if unhealthy
#
# No GitHub Actions, no GHCR, no external registry. The image is built on the VM.
#
# Update time: ~5s (no-op) or ~30-120s (rebuild, depending on what changed).
# Docker layer caching means pnpm install only re-runs when pnpm-lock.yaml changes.

set -euo pipefail

readonly APP_DIR="/opt/hamafx/app"
readonly COMPOSE_FILE="/opt/hamafx/docker-compose.yml"
readonly LOCK_FILE="/opt/hamafx/.update.lock"
readonly SHA_FILE="/opt/hamafx/.deployed-sha"
readonly CONTAINER="hamafx-worker"

# Load HC_UPDATE_UUID safely
HC_UUID=''
if [[ -f /opt/hamafx/.env ]]; then
  HC_UUID=$(grep -E '^HC_UPDATE_UUID=' /opt/hamafx/.env | cut -d= -f2- | tr -d '"' | tr -d "'")
fi

ping_hc() {
  local status="${1:-success}"
  local body="${2:-}"
  [[ -z "$HC_UUID" ]] && return 0
  local url="https://hc-ping.com/$HC_UUID"
  [[ "$status" != "success" ]] && url="$url/$status"
  if [[ -n "$body" ]]; then
    curl -fsS -m 5 --data "$body" "$url" >/dev/null 2>&1 || true
  else
    curl -fsS -m 5 "$url" >/dev/null 2>&1 || true
  fi
}

log() { printf '%s [docker-update] %s\n' "$(date -u +%FT%TZ)" "$*"; }

# Single-instance guard
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log 'another update run is in flight — skipping'
  exit 0
fi

# Must run as hamafx (in docker group)
if [[ "$(whoami)" != "hamafx" ]]; then
  log "ERROR: must run as hamafx (saw $(whoami))"
  ping_hc fail "wrong user: $(whoami)"
  exit 1
fi

cd "$APP_DIR"

PREV_SHA="$(git rev-parse HEAD)"
git fetch --quiet origin main || {
  log "git fetch failed"
  ping_hc fail "git fetch failed"
  exit 1
}
NEW_SHA="$(git rev-parse origin/main)"

if [[ "$PREV_SHA" == "$NEW_SHA" ]]; then
  log "no change ($PREV_SHA) — exit"
  exit 0
fi

log "upgrading $PREV_SHA -> $NEW_SHA"

# Tag the current image for instant rollback before building
docker tag hamafx-worker:local hamafx-worker:rollback 2>/dev/null || true

git reset --hard "$NEW_SHA" >/dev/null

# Build the new image (Docker layer cache makes this fast)
log "building Docker image"
if ! docker compose -f "$COMPOSE_FILE" build --quiet 2>&1; then
  log "docker compose build failed — rolling back"
  git reset --hard "$PREV_SHA" >/dev/null
  ping_hc fail "build failed at $NEW_SHA"
  exit 1
fi

# Restart with the new image
log "restarting container"
if ! docker compose -f "$COMPOSE_FILE" up -d --force-recreate --no-deps worker 2>&1; then
  log "docker compose up failed — rolling back"
  docker tag hamafx-worker:rollback hamafx-worker:local 2>/dev/null || true
  docker compose -f "$COMPOSE_FILE" up -d --force-recreate --no-deps worker 2>/dev/null || true
  ping_hc fail "up failed at $NEW_SHA, rolled back"
  exit 1
fi

# Post-deploy health check (30s window)
HEALTH_WAIT_SEC=30
log "post-deploy health check — waiting ${HEALTH_WAIT_SEC}s"
sleep "$HEALTH_WAIT_SEC"

HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo "unknown")
if [[ "$HEALTH_STATUS" != "healthy" ]]; then
  log "health check failed (status: $HEALTH_STATUS) — rolling back"
  docker tag hamafx-worker:rollback hamafx-worker:local 2>/dev/null || true
  git reset --hard "$PREV_SHA" >/dev/null
  docker compose -f "$COMPOSE_FILE" build --quiet 2>/dev/null || true
  docker compose -f "$COMPOSE_FILE" up -d --force-recreate --no-deps worker 2>/dev/null || true
  ping_hc fail "health check failed (status: $HEALTH_STATUS) at $NEW_SHA, rolled back to $PREV_SHA"
  exit 1
fi

# Success — record SHA
echo "$NEW_SHA" > "$SHA_FILE"
ENV_FILE='/opt/hamafx/.env'
if grep -q '^DEPLOYED_SHA=' "$ENV_FILE"; then
  sed -i "s|^DEPLOYED_SHA=.*|DEPLOYED_SHA=$NEW_SHA|" "$ENV_FILE"
else
  echo "DEPLOYED_SHA=$NEW_SHA" >> "$ENV_FILE"
fi

# Prune old images to reclaim disk
docker image prune -f >/dev/null 2>&1 || true

log "applied $NEW_SHA"
ping_hc success "applied $NEW_SHA"
```

### 3.3 `infra/cron-vm/scripts/docker-autoheal.sh`

Same as before — checks container health every minute, restarts after 3 consecutive unhealthy checks:

```bash
#!/usr/bin/env bash
# infra/cron-vm/scripts/docker-autoheal.sh
#
# Runs every minute via hamafx-docker-autoheal.timer.
# Checks if the hamafx-worker container is healthy.
# If unhealthy for 3 consecutive checks (3 minutes), restarts it.
#
# Docker's restart:unless-stopped handles crashes (exit code != 0),
# but does NOT restart unhealthy containers. This script fills that gap.

set -euo pipefail

readonly CONTAINER="hamafx-worker"
readonly STATE_FILE="/opt/hamafx/.autoheal-state"
readonly MAX_UNHEALTHY=3

log() { printf '%s [autoheal] %s\n' "$(date -u +%FT%TZ)" "$*"; }

# Read consecutive unhealthy count
count=0
[[ -f "$STATE_FILE" ]] && count=$(cat "$STATE_FILE" 2>/dev/null || echo 0)

HEALTH_STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo "not-found")

if [[ "$HEALTH_STATUS" == "healthy" ]]; then
  echo 0 > "$STATE_FILE"
  exit 0
fi

if [[ "$HEALTH_STATUS" == "not-found" ]]; then
  log "container $CONTAINER not found — skipping"
  exit 0
fi

# Container is unhealthy or starting
count=$((count + 1))
echo "$count" > "$STATE_FILE"

if (( count >= MAX_UNHEALTHY )); then
  log "container unhealthy for $count consecutive checks — restarting"
  docker restart "$CONTAINER" 2>/dev/null || true
  echo 0 > "$STATE_FILE"
fi
```

### 3.4 `infra/cron-vm/units/hamafx-docker-autoheal.service`

```ini
[Unit]
Description=HamaFX-Ai Docker container health monitor + auto-restart
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
User=hamafx
Group=hamafx
ExecStart=/opt/hamafx/scripts/docker-autoheal.sh
TimeoutStartSec=30

NoNewPrivileges=true
PrivateTmp=true

StandardOutput=journal
StandardError=journal
SyslogIdentifier=hamafx-docker-autoheal
```

### 3.5 `infra/cron-vm/units/hamafx-docker-autoheal.timer`

```ini
[Unit]
Description=Check worker container health every minute

[Timer]
OnBootSec=3min
OnUnitActiveSec=1min
RandomizedDelaySec=15
Unit=hamafx-docker-autoheal.service

[Install]
WantedBy=timers.target
```

### 3.6 `infra/cron-vm/_provision-docker.sh`

One-shot provisioning script — installs Docker + host tools, clones repo, builds image, starts container, installs timers:

```bash
#!/usr/bin/env bash
# infra/cron-vm/_provision-docker.sh — Docker-based VM provisioner.
#
# Sets up the VM with:
#   1. Docker + docker-compose plugin
#   2. git (to clone repo for Docker build context)
#   3. GCP CLI (gsutil for backups)
#   4. postgresql-client (pg_dump, psql for backups/tenant ops)
#   5. curl (for light crons)
#   6. /opt/hamafx/.env from staged file
#   7. Clones repo to /opt/hamafx/app (build context for Docker)
#   8. docker-compose.yml + scripts
#   9. systemd timers (reduced set — no heavy job timers)
#  10. Builds and starts the worker container
#
# NO Node.js or pnpm on the host — they live inside Docker build stages.
# NO GitHub Actions or external registry — image is built on the VM.
#
# Idempotent — safe to re-run.

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly STAGE="${SCRIPT_DIR}"
readonly ENV_SRC='/tmp/hamafx-vm.env'
readonly INSTALL_DIR='/opt/hamafx'
readonly APP_DIR="${INSTALL_DIR}/app"
readonly REPO_URL='https://github.com/HamaFx/HamaFX-Ai.git'

log() { printf '%s [provision-docker] %s\n' "$(date -u +%FT%TZ)" "$*"; }

if [[ "$EUID" -ne 0 ]]; then
  echo "must run as root (sudo bash _provision-docker.sh)" >&2
  exit 1
fi

log 'creating /opt/hamafx and the hamafx system user'
install -d -m 755 "$INSTALL_DIR"
if ! id hamafx >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "${INSTALL_DIR}/home" \
    --shell /usr/sbin/nologin hamafx
fi
chown -R hamafx:hamafx "$INSTALL_DIR"

log 'installing /opt/hamafx/.env from staged file (mode 600)'
if [[ -f "$ENV_SRC" ]]; then
  install -m 600 -o hamafx -g hamafx "$ENV_SRC" "${INSTALL_DIR}/.env"
else
  log "WARNING: $ENV_SRC not found — write /opt/hamafx/.env manually before starting"
fi

log 'installing prerequisite system packages'
apt-get update -qq
apt-get install -y -qq curl git logrotate sudo postgresql-client \
  ca-certificates apt-transport-https gnupg \
  docker.io docker-compose-v2

log 'enabling Docker (starts on boot, survives reboots)'
systemctl enable --now docker
usermod -aG docker hamafx

log 'installing google-cloud CLI (gsutil) for backups'
if ! command -v gsutil >/dev/null 2>&1; then
  echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
    > /etc/apt/sources.list.d/google-cloud-sdk.list
  curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
    | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
  apt-get update -qq
  apt-get install -y -qq google-cloud-cli
fi

log 'ensuring GCP firewall rules (SSH only — port 8081 NOT exposed)'
if ! gcloud compute firewall-rules describe hamafx-allow-ssh --project=hamafx-78845 2>/dev/null; then
  gcloud compute firewall-rules create hamafx-allow-ssh \
    --network default --allow tcp:22 --source-ranges 0.0.0.0/0 \
    --project hamafx-78845 --quiet
fi

log 'cloning the repo into /opt/hamafx/app (Docker build context)'
if [[ -d "$APP_DIR/.git" ]]; then
  sudo -u hamafx git -C "$APP_DIR" fetch --quiet origin main
  sudo -u hamafx git -C "$APP_DIR" reset --hard origin/main
else
  rm -rf "$APP_DIR"
  sudo -u hamafx git clone --depth 1 "$REPO_URL" "$APP_DIR"
fi

log 'configuring journald storage limits'
cat > /etc/systemd/journald.conf.d/hamafx.conf <<'JOURNALD'
[Journal]
SystemMaxUse=500M
SystemKeepFree=2G
MaxFileSec=7day
JOURNALD
systemctl restart systemd-journald

log 'installing sudoers entry'
if [[ -f "${STAGE}/sudoers.d/hamafx" ]]; then
  install -m 440 -o root -g root "${STAGE}/sudoers.d/hamafx" /etc/sudoers.d/hamafx
  visudo -c -f /etc/sudoers.d/hamafx >/dev/null
fi

log 'copying docker-compose.yml to /opt/hamafx/'
install -m 644 -o hamafx -g hamafx \
  "${STAGE}/docker-compose.vm.yml" "${INSTALL_DIR}/docker-compose.yml"

log 'copying scripts to /opt/hamafx/scripts/'
install -d -m 755 -o hamafx -g hamafx "${INSTALL_DIR}/scripts"
for script in docker-update.sh docker-autoheal.sh \
  backup-db.sh backup-journal.sh verify-restore.sh \
  delete-tenant.sh export-tenant.sh _load-env.sh; do
  if [[ -f "${STAGE}/scripts/${script}" ]]; then
    install -m 755 -o hamafx -g hamafx "${STAGE}/scripts/${script}" "${INSTALL_DIR}/scripts/"
  fi
done
chmod +x "${INSTALL_DIR}/scripts/"*.sh 2>/dev/null || true

log 'tearing down legacy cron'
systemctl stop cron 2>/dev/null || true
systemctl disable cron 2>/dev/null || true
crontab -l 2>/dev/null | grep -v 'hamafx' | crontab - 2>/dev/null || true

log 'logrotate config for legacy log path'
cat > /etc/logrotate.d/hamafx-cron <<'LOGROTATE'
/var/log/hamafx-cron.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
    create 0644 root root
}
LOGROTATE

log 'installing systemd units (reduced set — no heavy job timers, no worker.service)'
for unit in \
  hamafx-light-news hamafx-light-calendar hamafx-light-alerts \
  hamafx-light-warm-cache hamafx-light-cleanup-uploads \
  hamafx-backup-db hamafx-backup-journal hamafx-verify-restore \
  hamafx-tenant-export hamafx-tenant-delete \
  hamafx-disk-check hamafx-docker-prune \
  hamafx-update hamafx-docker-autoheal; do
  for ext in service timer; do
    [[ -f "${STAGE}/units/${unit}.${ext}" ]] && \
      install -m 644 "${STAGE}/units/${unit}.${ext}" "/etc/systemd/system/"
  done
done
systemctl daemon-reload

log 'enabling + starting timers'
for timer in \
  hamafx-light-news.timer hamafx-light-calendar.timer \
  hamafx-light-alerts.timer hamafx-light-warm-cache.timer \
  hamafx-light-cleanup-uploads.timer \
  hamafx-backup-db.timer hamafx-backup-journal.timer \
  hamafx-verify-restore.timer \
  hamafx-tenant-export.timer hamafx-tenant-delete.timer \
  hamafx-disk-check.timer hamafx-docker-prune.timer \
  hamafx-update.timer hamafx-docker-autoheal.timer; do
  systemctl enable --now "$timer" 2>/dev/null || true
done

log 'building and starting the worker container (first build takes ~2-3 min)'
cd "$INSTALL_DIR"
sudo -u hamafx docker compose build 2>&1
sudo -u hamafx docker compose up -d 2>&1

log 'waiting for worker to become healthy (up to 120s)'
for i in $(seq 1 60); do
  status=$(docker inspect --format='{{.State.Health.Status}}' hamafx-worker 2>/dev/null || echo "not-found")
  if [[ "$status" == "healthy" ]]; then
    log "worker is healthy (after $((i*2))s)"
    break
  fi
  if [[ "$i" -eq 60 ]]; then
    log "WARNING: worker not healthy after 120s — check: docker logs hamafx-worker"
  fi
  sleep 2
done

log 'final state'
echo "--- Timers ---"
systemctl list-timers --all 'hamafx-*' --no-pager | head -20
echo "--- Container ---"
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

log 'done.'
```

---

## 4. Modified Files

### 4.1 `infra/cron-vm/units/hamafx-update.service`

```ini
[Unit]
Description=HamaFX-Ai self-update (git pull + Docker build + container restart)
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=oneshot
User=hamafx
Group=hamafx
WorkingDirectory=/opt/hamafx
EnvironmentFile=/opt/hamafx/.env
ExecStart=/opt/hamafx/scripts/docker-update.sh
TimeoutStartSec=600

# Docker needs NoNewPrivileges=false (hamafx is in docker group)
NoNewPrivileges=false

StandardOutput=journal
StandardError=journal
SyslogIdentifier=hamafx-update
```

### 4.2 `infra/cron-vm/units/hamafx-update.timer`

```ini
[Unit]
Description=Self-update every 5 minutes (git pull + Docker build)

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
RandomizedDelaySec=30
Unit=hamafx-update.service

[Install]
WantedBy=timers.target
```

### 4.3 Infrastructure service units — update script paths

Change `/opt/hamafx/app/infra/cron-vm/scripts/` to `/opt/hamafx/scripts/` in:

- `hamafx-backup-db.service` → `ExecStart=/opt/hamafx/scripts/backup-db.sh`
- `hamafx-backup-journal.service` → `ExecStart=/opt/hamafx/scripts/backup-journal.sh`
- `hamafx-verify-restore.service` → `ExecStart=/opt/hamafx/scripts/verify-restore.sh`
- `hamafx-tenant-export.service` → `ExecStart=/opt/hamafx/scripts/export-tenant.sh __system__`
- `hamafx-tenant-delete.service` → `ExecStart=/opt/hamafx/scripts/delete-tenant.sh __system__`

### 4.4 `infra/cron-vm/units/hamafx-docker-prune.timer`

Change to Sun 06:00 to avoid overlap:

```ini
[Timer]
OnCalendar=Sun *-*-* 06:00:00 UTC
RandomizedDelaySec=600
Persistent=true
```

### 4.5 `infra/cron-vm/sudoers.d/hamafx`

Add docker restart permission for emergencies:

```sudoers
hamafx ALL=(root) NOPASSWD: /bin/systemctl restart docker
hamafx ALL=(root) NOPASSWD: /bin/systemctl restart hamafx-worker.service
hamafx ALL=(root) NOPASSWD: /bin/systemctl restart hamafx-worker
```

---

## 5. Deleted Files

These 17 files are no longer needed — the Docker container handles the worker + all heavy jobs:

```
infra/cron-vm/units/hamafx-worker.service          ← replaced by Docker container
infra/cron-vm/units/hamafx-job-briefings.service   ← runs in container
infra/cron-vm/units/hamafx-job-briefings.timer
infra/cron-vm/units/hamafx-job-cot.service         ← runs in container
infra/cron-vm/units/hamafx-job-cot.timer
infra/cron-vm/units/hamafx-job-embedding-backfill.service ← runs in container
infra/cron-vm/units/hamafx-job-embedding-backfill.timer
infra/cron-vm/units/hamafx-job-fred-actuals.service ← runs in container
infra/cron-vm/units/hamafx-job-fred-actuals.timer
infra/cron-vm/units/hamafx-job-resonance-sync.service ← runs in container
infra/cron-vm/units/hamafx-job-resonance-sync.timer
infra/cron-vm/units/hamafx-job-snapshots.service   ← runs in container
infra/cron-vm/units/hamafx-job-snapshots.timer
infra/cron-vm/units/hamafx-job-weekly-review.service ← runs in container
infra/cron-vm/units/hamafx-job-weekly-review.timer
infra/cron-vm/update.sh                             ← replaced by docker-update.sh
infra/cron-vm/_provision.sh                         ← replaced by _provision-docker.sh
infra/cron-vm/setup.sh                              ← replaced by _provision-docker.sh
infra/cron-vm/setup-worker.sh                       ← already deprecated
```

**Keep unchanged:**
- `infra/cron-vm/scripts/backup-db.sh`
- `infra/cron-vm/scripts/backup-journal.sh`
- `infra/cron-vm/scripts/verify-restore.sh`
- `infra/cron-vm/scripts/delete-tenant.sh`
- `infra/cron-vm/scripts/export-tenant.sh`
- `infra/cron-vm/scripts/_load-env.sh`
- `infra/cron-vm/sudoers.d/hamafx`
- All `hamafx-light-*.service` and `hamafx-light-*.timer` files
- `hamafx-disk-check.service` and `hamafx-disk-check.timer`
- `hamafx-docker-prune.service` and `hamafx-docker-prune.timer`

---

## 6. Boot / Shutdown / Crash Recovery

### 6.1 VM Cold Boot

```
systemd init (PID 1)
  │
  ├── docker.service starts (systemctl enable docker)
  │     └── Docker daemon starts
  │           └── hamafx-worker container auto-starts (restart: unless-stopped)
  │                 ├── node dist/index.js starts
  │                 ├── loadEnv() → zod validates all env vars
  │                 ├── WORKER_MODE=docker → startScheduler() registers all 8 jobs
  │                 ├── installSignalHandlers() → SIGTERM/SIGINT
  │                 ├── runWorker()
  │                 │     ├── SignalR consumer connects to BiQuote
  │                 │     ├── Binance WS consumer connects
  │                 │     ├── TwelveData WS consumer connects (if API key)
  │                 │     ├── MT5 TCP server on 127.0.0.1:8080
  │                 │     ├── SymbolManager starts polling DB (60s)
  │                 │     ├── 1Hz flush timer → live_ticks UPSERT
  │                 │     └── 30s heartbeat → healthchecks.io
  │                 └── Health server on 127.0.0.1:8081
  │
  ├── timers.target reached
  │     ├── Light cron timers activate (5 timers)
  │     ├── hamafx-update.timer → fires 2 min after boot
  │     │     └── docker-update.sh: git fetch → no-op if same SHA
  │     ├── hamafx-docker-autoheal.timer → fires 3 min after boot
  │     ├── backup-db, backup-journal timers (Persistent=true → catch up)
  │     ├── verify-restore timer (Persistent=true → catch up)
  │     ├── tenant-export, tenant-delete timers (Persistent=true → catch up)
  │     ├── disk-check timer (Persistent=true → catch up)
  │     └── docker-prune timer (Persistent=true → catch up)
  │
  └── Network ready → container reaches Supabase, BiQuote, Binance, etc.
```

**✅ Fully automated. Zero manual intervention.**

### 6.2 VM Graceful Shutdown

```
systemd sends SIGTERM to docker.service
  │
  ├── Docker daemon sends SIGTERM to hamafx-worker container
  │     └── stop_grace_period: 30s
  │
  ├── Worker catches SIGTERM:
  │     1. shutdownLangfuse() → flushes events
  │     2. flushSentry(2_000) → flushes Sentry (2s timeout)
  │     3. worker.stop()
  │        ├── clearInterval(flushTimer) → stops 1Hz DB writes
  │        ├── clearInterval(heartbeatTimer) → stops HC pings
  │        ├── symbolManager.stop() → clears 60s poll timer
  │        ├── Promise.all([mt5Server.stop(), consumer.stop(),
  │        │   binanceConsumer.stop(), tdConsumer.stop()])
  │        ├── flushLiveTicks() → final buffer drain to DB
  │        └── aggregator.closeAll() → emits partial candles
  │     4. healthServer.close()
  │     └── process.exit(0)
  │
  └── Timers: systemd stops all timer units
```

**✅ Graceful. Buffer drained, connections closed, partial candles emitted.**

### 6.3 Container Crash (OOM, uncaughtException)

```
Worker process exits (non-zero)
  │
  ├── Docker detects container exit
  │     └── restart: unless-stopped → restarts after ~2s
  │
  ├── In-memory state lost:
  │     ├── TickBuffer → LOST (≤1s of tick data)
  │     ├── Open 1m candle bars → LOST (≤59s of tick data)
  │     └── SymbolManager state → re-fetched from DB
  │
  ├── Persistent state survives (Supabase):
  │     ├── live_ticks → persists
  │     ├── candles_1m → persists
  │     └── cron_runs → persists (idempotency locks)
  │
  └── On restart: all connections re-establish, scheduler re-registers
```

**✅ Automatic. Data loss ≤1s of ticks + current open 1m bar.**

### 6.4 Container Unhealthy (ticks stop, process alive)

```
No ticks for 120s+ → /health returns 503 → Docker marks container unhealthy
  │
  ├── hamafx-docker-autoheal.timer fires (every 1 min)
  │     └── docker-autoheal.sh:
  │           ├── Unhealthy count 1 → log, wait
  │           ├── Unhealthy count 2 → log, wait
  │           └── Unhealthy count 3 → docker restart hamafx-worker
  │
  ├── Worker 30s heartbeat → healthchecks.io sends "fail" ping → user alerted
  │
  └── After restart: reconnects to all providers, ticks resume
```

**✅ Automatic. 3-minute window before restart. User alerted via healthchecks.io.**

---

## 7. Self-Update Flow

```
hamafx-update.timer fires (every 5 min, OnBootSec=2min)
  │
  ├── docker-update.sh runs as hamafx user
  │     ├── flock guard (prevents concurrent runs)
  │     ├── git fetch origin main
  │     ├── If HEAD == origin/main → exit (no-op, ~2s)
  │     ├── Tag current image as hamafx-worker:rollback
  │     ├── git reset --hard origin/main
  │     ├── docker compose build (layer cache — fast when only source changes)
  │     │     └── pnpm install only re-runs if pnpm-lock.yaml changed
  │     │     └── Source changes rebuild in ~10-30s
  │     │     └── Full rebuild (no cache) takes ~2-3 min
  │     ├── docker compose up -d --force-recreate worker
  │     │     └── Old container gets SIGTERM → graceful shutdown
  │     │     └── New container starts → boot sequence
  │     ├── Wait 30s for health check
  │     │     ├── If "healthy" → success!
  │     │     └── If not "healthy" → ROLLBACK
  │     │           ├── docker tag hamafx-worker:rollback → hamafx-worker:local
  │     │           ├── git reset --hard PREV_SHA
  │     │           ├── docker compose build + up -d
  │     │           └── ping_hc fail "rolled back"
  │     ├── Update DEPLOYED_SHA in /opt/hamafx/.env
  │     ├── docker image prune -f
  │     └── ping_hc success
  │
  └── Total time: ~2s (no-op), ~30-60s (source-only change), ~2-3min (full rebuild)
```

**✅ Fully automated with instant rollback. No external registry needed.**

### Docker Layer Caching Explanation

The `Dockerfile.worker` has 4 stages. Docker caches each layer:

| Stage | What it does | When it re-runs |
|-------|-------------|----------------|
| `base` | Install Node.js 20 + pnpm 9 | Never (base image doesn't change) |
| `deps` | `pnpm install --frozen-lockfile` | Only when `pnpm-lock.yaml` changes |
| `builder` | `pnpm turbo run build` + `deploy --prod` | Every time source files change (~10-30s) |
| `runner` | Copy pruned output + install curl | Every time builder output changes (~1s) |

**Typical update (source-only change):** ~30-60 seconds total
**Lockfile change (new dependency):** ~2-3 minutes total
**No change:** ~2 seconds (git fetch + compare)

---

## 8. Data Flow Verification

### 8.1 Price Data (unchanged)

```
Container worker                    Supabase Postgres           Vercel (apps/web)
                                     ┌───────────┐
BiQuote SignalR ──tick──>            │ live_ticks │ <──read── /api/market/price
Binance WS ──tick──>   handleTick →  │ (UPSERT   │           │
TwelveData WS ──tick──>              │  at 1Hz)  │           ▼
MT5 TCP ──tick──>                    └───────────┘     getPriceWithMeta()
                                     ┌───────────┐       │
                          1m close → │ candles_1m│ <──read── /api/market/candles
                                     └───────────┘     getCandles()
                                                          │
                                                     failover:
                                                     1. live-ticks (DB) ← container writes
                                                     2. biquote (REST) ← Vercel direct
                                                     3. binance (REST) ← Vercel direct
                                                     4. twelvedata (REST) ← if key
                                                     5. finnhub (REST) ← if key
```

**✅ When container is down:** live_ticks goes stale, Vercel falls through to REST. Frontend keeps working.

### 8.2 Job Data (unchanged — jobs run inside container)

All 8 jobs write to the same DB tables, read by the same AI tools and frontend components. No change in data flow — only where the jobs physically run (inside the container instead of systemd one-shot processes).

### 8.3 Light Cron + Backups (unchanged — stay on host)

Light crons still curl Vercel. Backups still pg_dump + gsutil. verify-restore still uses Docker-in-Docker. All unchanged.

---

## 9. Migration Steps (Current VM → Docker)

### Step 1: Create and modify files locally, push to main

```bash
# Create new files:
#   infra/cron-vm/docker-compose.vm.yml
#   infra/cron-vm/scripts/docker-update.sh
#   infra/cron-vm/scripts/docker-autoheal.sh
#   infra/cron-vm/units/hamafx-docker-autoheal.service
#   infra/cron-vm/units/hamafx-docker-autoheal.timer
#   infra/cron-vm/_provision-docker.sh

# Modify existing files:
#   Dockerfile.worker (add DEPLOYED_SHA build arg)
#   infra/cron-vm/units/hamafx-update.service
#   infra/cron-vm/units/hamafx-update.timer
#   infra/cron-vm/units/hamafx-backup-db.service (script path)
#   infra/cron-vm/units/hamafx-backup-journal.service (script path)
#   infra/cron-vm/units/hamafx-verify-restore.service (script path)
#   infra/cron-vm/units/hamafx-tenant-export.service (script path)
#   infra/cron-vm/units/hamafx-tenant-delete.service (script path)
#   infra/cron-vm/units/hamafx-docker-prune.timer (schedule)
#   infra/cron-vm/sudoers.d/hamafx (add docker restart)

# Delete old files:
#   hamafx-worker.service
#   hamafx-job-*.{service,timer} (16 files)
#   update.sh, _provision.sh, setup.sh, setup-worker.sh

git add -A
git commit -m "infra: Docker-based VM worker deployment (build on VM, no GHCR)"
git push origin main
```

### Step 2: Deploy to VM

```bash
# Copy the new infra/cron-vm directory to the VM
gcloud compute scp -r infra/cron-vm hamafx-cron:/tmp/hamafx-cron-stage --zone=us-central1-a

# Copy the .env file (if not already on the VM)
gcloud compute scp .env hamafx-cron:/tmp/hamafx-vm.env --zone=us-central1-a

# Run the new provisioning script
gcloud compute ssh hamafx-cron --zone=us-central1-a \
  --command="sudo bash /tmp/hamafx-cron-stage/_provision-docker.sh"
```

### Step 3: Verify

```bash
# Container is running and healthy
gcloud compute ssh hamafx-cron --zone=us-central1-a \
  --command="docker ps && docker inspect --format='{{.State.Health.Status}}' hamafx-worker"

# Timers are active
gcloud compute ssh hamafx-cron --zone=us-central1-a \
  --command="systemctl list-timers --all 'hamafx-*'"

# Worker logs show scheduler started
gcloud compute ssh hamafx-cron --zone=us-central1-a \
  --command="docker logs hamafx-worker 2>&1 | tail -20"

# Health endpoint responds
gcloud compute ssh hamafx-cron --zone=us-central1-a \
  --command="curl -s http://localhost:8081/health"
```

### Step 4: Clean up old files

```bash
# Remove old Node.js + pnpm from host (no longer needed — saves ~200MB)
gcloud compute ssh hamafx-cron --zone=us-central1-a \
  --command="sudo apt-get remove -y nodejs && sudo apt-get autoremove -y"

# Old built dist/ at /opt/hamafx/app/apps/worker/dist/ is now just Docker build context
# No need to remove — git checkout is needed for docker compose build
```

---

## 10. Rollback Plan

### Instant rollback (image-level — 5 seconds)

```bash
# docker-update.sh tags the previous image as hamafx-worker:rollback
docker tag hamafx-worker:rollback hamafx-worker:local
docker compose -f /opt/hamafx/docker-compose.yml up -d --force-recreate
```

### Full rollback to bare-metal Node.js

```bash
# Stop and remove the Docker worker
docker compose -f /opt/hamafx/docker-compose.yml down

# Re-install Node.js + pnpm
sudo apt-get install -y nodejs
sudo corepack enable && sudo corepack prepare pnpm@9 --activate

# Re-enable old systemd units (from the repo)
sudo bash /opt/hamafx/app/infra/cron-vm/setup.sh
```

---

## 11. Verification Checklist

### Docker Image Build
- [ ] `Dockerfile.worker` builds successfully on the VM
- [ ] `DEPLOYED_SHA` build arg is embedded in the image
- [ ] Image includes `curl` for healthcheck
- [ ] `WORKER_MODE=docker` is set by default
- [ ] All workspace dependencies are bundled (no missing imports at runtime)
- [ ] Docker layer caching works (rebuild is fast when only source changes)

### VM Deployment
- [ ] `_provision-docker.sh` installs Docker + git + host tools
- [ ] Repo is cloned to `/opt/hamafx/app` (Docker build context)
- [ ] Worker container starts and becomes healthy within 120s
- [ ] All 8 heavy jobs are scheduled inside the container
- [ ] Light crons still POST to Vercel successfully
- [ ] Backups still run (pg_dump + gsutil on host)
- [ ] verify-restore still runs (Docker-in-Docker on host)

### Boot / Shutdown / Restart
- [ ] Docker daemon starts on VM boot
- [ ] Worker container auto-starts (`restart: unless-stopped`)
- [ ] `hamafx-update.timer` fires 2 min after boot
- [ ] `hamafx-docker-autoheal.timer` fires 3 min after boot
- [ ] `docker compose down` gracefully stops the worker (30s)
- [ ] Container restarts automatically on crash

### Self-Update
- [ ] `docker-update.sh` detects new commits on main
- [ ] `docker compose build` uses layer cache (fast rebuilds)
- [ ] 30s health check catches bad builds
- [ ] Rollback restores previous image + code
- [ ] Healthcheck ping fires on success/failure
- [ ] `docker image prune` reclaims old images

### Autoheal
- [ ] `docker-autoheal.sh` checks container health every minute
- [ ] Restarts container after 3 consecutive unhealthy checks
- [ ] Resets counter on healthy status

### Data Flow
- [ ] Container writes live_ticks at 1Hz
- [ ] Container writes candles_1m on minute close
- [ ] Vercel reads live_ticks as first price provider
- [ ] Vercel falls back to BiQuote REST when live_ticks is stale
- [ ] All 8 jobs write to correct DB tables
- [ ] SymbolManager polls DB for user_symbols
- [ ] Healthchecks.io receives 30s heartbeat from container

### Security
- [ ] Port 8081 bound to 127.0.0.1 (not accessible from internet)
- [ ] Port 8080 bound to 127.0.0.1 (not accessible from internet)
- [ ] BiQuote proxy requires bearer auth when BIQUOTE_PROXY_TOKEN is set
- [ ] GCP firewall only allows SSH (port 22)
- [ ] Container runs as non-root (node user in node:20-slim)
- [ ] .env file is mode 600, owned by hamafx

### Resource Usage
- [ ] Container memory limit: 1.5GB
- [ ] Container CPU limit: 1.5 cores
- [ ] Docker image: ~300MB on disk
- [ ] Log rotation: 150MB max (50m × 3)
- [ ] Total VM disk: <1.5GB (image + repo + logs + scripts)
