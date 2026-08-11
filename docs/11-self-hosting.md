# 11 — Self-Hosting Guide

> How to deploy the single-user BYOK OSS release on your own server using Docker Compose. Shared multi-user/RLS mode is intentionally disabled.

## Prerequisites

- **Docker Desktop** installed and running on your computer.
- At least 2GB of RAM (4GB recommended).
- For the easiest setup, download the project, open its folder, and run `pnpm setup`. Choose **Full mode** when the wizard asks. The wizard creates the `.env` file automatically; you do not need Bash or manual secret commands.
- A domain name (optional, but recommended if exposing to the internet).
- This guide deploys one owner account per instance; it is not a shared-hosting guide.

## 1. Download & Configure

### Recommended: use the setup wizard

```bash
pnpm setup
```

Choose **Full mode**. It generates secure settings from the shared secret template, backs up any existing `.env` first (`.env.bak`), validates `docker compose config`, and offers to start the Docker stack for you. After the browser opens, register the owner account and add your AI provider key inside the onboarding screen.

For a fully scripted install (CI, remote servers), skip the interactive questions:

```bash
pnpm setup --mode=docker --yes
pnpm setup --dry-run             # preview every change, write nothing
pnpm setup --json                # machine-readable result on stdout
```

### Manual setup (advanced)

```bash
git clone https://github.com/HamaFx/HamaFX-Ai.git
cd HamaFX-Ai
cp .env.example .env
```

Open `.env` in your preferred editor. You must configure the following core variables at minimum:

```bash
# Auth — generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
AUTH_SECRET="your_generated_secret_here"
AUTH_URL="http://localhost:3000"

# Encryption — generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_SECRET="your_32_byte_hex_string_here"

# Cron — generate with: node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
CRON_SECRET="your_cron_secret_here"

# Database (Docker Compose provides its own Postgres — point to it)
DATABASE_URL="postgresql://hamafx:hamafx@db:5432/hamafx"

# (Optional) Global AI API keys — users can also BYOK via the UI
GOOGLE_GENERATIVE_AI_API_KEY="your_gemini_key"
```

> **Note:** The project uses `AUTH_SECRET` (NextAuth v5 convention). `NEXTAUTH_SECRET` still works as a fallback but is deprecated.

## 2. Start the Stack

```bash
./docker/init-secrets.sh
docker compose up -d
# Optional local Langfuse observability:
# docker compose --profile observability up -d
# Backups run automatically in the `backup` service.
```

Docker will build the Next.js `app` and the `worker` containers. Once running, access the application at **http://localhost:3000**. The generated `.env` contains separate Langfuse secrets; do not enable the observability profile without running `./docker/init-secrets.sh` first. The optional profile is deliberately rendered with empty Langfuse values when those secrets are absent, but Langfuse itself requires the generated non-empty values.

If host port 5432 is already in use, set `POSTGRES_PUBLISHED_PORT=127.0.0.1:5433` in `.env` before starting Compose. The app and backup worker continue to use the internal `db:5432` network address.

### Services

| Service | Port | Description |
|---------|------|-------------|
| `app` | 3000 | Next.js web application (frontend + API routes) |
| `worker` | 8081 (healthcheck) | Background worker (SignalR consumer, tick processing, scheduled jobs) |
| `db` | 5432 | PostgreSQL 16 with pgvector extension |
| `backup` | — | Local compressed PostgreSQL dumps and freshness healthcheck |
| `langfuse` | 3001 | Optional LLM observability (`observability` profile) |

### Architecture

- **`db`**: PostgreSQL 16 with the `pgvector` extension for vector embeddings.
- **`backup`**: A private `postgres:16-alpine` sidecar writes one compressed custom-format dump per interval to the named `backup-data` volume. Defaults are once daily, seven-day retention, and a 48-hour freshness alarm. It has no published port and writes only to the backup volume.
- **`langfuse`**: Optional local LLM observability. It is not started by default; use the `observability` Compose profile and explicitly configure the app's `LANGFUSE_*` variables if you want traces to leave the app process.
- **`app`**: The Next.js web application. Drizzle schema migrations are applied automatically when the container starts.
- **`worker`**: Connects to the SignalR market data stream and runs a built-in `node-cron` scheduler for alerts, briefings, and daily/weekly jobs.

## 3. Local backups and restore

The default Docker stack creates a `backup` service and a named `backup-data` volume. Configure the schedule in `.env`:

```bash
BACKUP_INTERVAL_SECONDS=86400  # default: 24 hours
BACKUP_RETENTION_DAYS=7        # default: 7 days
BACKUP_MAX_AGE_SECONDS=172800  # health turns unhealthy after 48 hours
```

Inspect backup status and logs:

```bash
docker compose ps backup
docker compose logs --tail=100 backup
```

Restore is intentionally operator-confirmed because it replaces the current database. Stop external writes, then select `latest` or an archive filename shown in the backup logs:

```bash
HAMAFX_RESTORE_CONFIRM=YES ./docker/restore-db.sh latest
# or:
HAMAFX_RESTORE_CONFIRM=YES ./docker/restore-db.sh hamafx-20260810T030000Z.dump.gz
```

The restore script stops `app`, `worker`, and `backup`, then runs `pg_restore --clean --if-exists` from a short-lived backup-image container over the private Compose network. It starts the application services again only after the restore command succeeds. Before using this in production, rehearse restoring to a disposable instance and verify that the application starts with the restored schema and data.

**Important limitation:** the default backup destination is a local Docker volume on the same host. It protects against accidental database damage and gives you a quick rollback, but it does **not** protect against host, disk, ransomware, or volume loss. For real disaster recovery, periodically copy the archives off-host using your own storage/backup policy.

The same workflow is validated in CI by `.github/workflows/docker-backup.yml`, which seeds a disposable database, creates a local archive, mutates the data, restores the archive, verifies the original marker, and removes all test volumes.

## 4. Updates

```bash
cd HamaFX-Ai
git pull origin main
docker compose up -d --build
```

Drizzle schema migrations are applied automatically when the `app` container starts. The migration role must own the application tables (or have equivalent `ALTER TABLE` privileges), because the single-user release removes the unconditional RLS policies after applying the schema.

## 5. Security & Reverse Proxy

The `docker-compose.yml` binds ports 3000 (web) and 3001 (Langfuse) to `localhost` by default. For internet-facing deployments, put the stack behind a reverse proxy with SSL termination:

### Caddy Example

```caddyfile
hamafx.yourdomain.com {
    reverse_proxy localhost:3000
}

langfuse.yourdomain.com {
    reverse_proxy localhost:3001
}
```

### Nginx Example

```nginx
server {
    listen 443 ssl;
    server_name hamafx.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 6. First-Run User Setup

The generated configuration uses secure defaults:

- `BYOK_ENABLED=1`: each user supplies their own AI provider key.
- `MULTI_USER_ENABLED=0`: the instance is single-user by default.
- `REGISTRATION_MODE=owner-first`: the first account becomes the owner; later public registration is closed.
- External Sentry/Langfuse observability is disabled unless you explicitly configure it.

After accessing the app for the first time:

1. **Register** at `/register` — create the owner account with email + password.
2. **Onboarding wizard** — set your display name, timezone, default symbol, and AI provider key.
3. **Start chatting** — the AI agent is ready to go.

For a shared installation, do not enable multi-user mode. `MULTI_USER_ENABLED=1`, `HAMAFX_ENABLE_RLS=1`, and open registration are rejected by this OSS release until every user-data query establishes tenant context and the PostgreSQL isolation suite is complete.

See [13-first-run-setup.md](./13-first-run-setup.md) for detailed first-run information.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `Invalid environment configuration: AUTH_SECRET must be at least 32 chars` | Secret not set or too short | Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `relation does not exist` on first boot | Migrations didn't run | `docker compose restart app` |
| Worker can't connect to SignalR | BiQuote endpoint unreachable | Set `BIQUOTE_BASE_URL` in `.env` (BiQuote is keyless) |
| `Daily AI budget exceeded` | Hit the spending cap | Wait until UTC midnight or raise `MAX_DAILY_USD` |
| Encrypted BYOK keys unreadable after restart | `ENCRYPTION_SECRET` changed | Restore the original secret; for planned rotation, follow the guarded procedure in [10-security.md](./10-security.md) |
