# 11 — Self-Hosting Guide

> How to deploy HamaFX-Ai on your own server using Docker Compose.

## Prerequisites

- **Docker** and **Docker Compose V2** installed on your host.
- At least 2GB of RAM (4GB recommended).
- A domain name (optional, but recommended if exposing to the internet).

## 1. Clone & Configure

```bash
git clone https://github.com/HamaFx/HamaFX-Ai.git
cd HamaFX-Ai

# Copy the example environment file
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
docker compose -f docker-compose.prod.yml up -d
```

Docker will build the Next.js `app` and the `worker` containers. Once running, access the application at **http://localhost:3000**.

### Services

| Service | Port | Description |
|---------|------|-------------|
| `app` | 3000 | Next.js web application (frontend + API routes) |
| `worker` | 8081 (healthcheck) | Background worker (SignalR consumer, tick processing, scheduled jobs) |
| `db` | 5432 | PostgreSQL 16 with pgvector extension |
| `langfuse` | 3001 | LLM observability platform (optional) |

### Architecture

- **`db`**: PostgreSQL 16 with the `pgvector` extension for vector embeddings.
- **`langfuse`**: LLM observability platform. Tracing is optional — when `LANGFUSE_*` env vars are unset, the app boots normally with no tracing overhead.
- **`app`**: The Next.js web application. Drizzle schema migrations are applied automatically when the container starts.
- **`worker`**: Connects to the SignalR market data stream and runs a built-in `node-cron` scheduler for alerts, briefings, and daily/weekly jobs.

## 3. Updates

```bash
cd HamaFX-Ai
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
```

Drizzle schema migrations are applied automatically when the `app` container starts.

## 4. Security & Reverse Proxy

The `docker-compose.prod.yml` binds ports 3000 (web) and 3001 (Langfuse) to `localhost` by default. For internet-facing deployments, put the stack behind a reverse proxy with SSL termination:

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

## 5. First-Run User Setup

After accessing the app for the first time:

1. **Register** at `/register` — create an account with email + password.
2. **Onboarding wizard** — set your display name, timezone, default symbol, and AI provider key.
3. **Start chatting** — the AI agent is ready to go.

See [13-first-run-setup.md](./13-first-run-setup.md) for detailed first-run information.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `Invalid environment configuration: AUTH_SECRET must be at least 32 chars` | Secret not set or too short | Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `relation does not exist` on first boot | Migrations didn't run | `docker compose -f docker-compose.prod.yml restart app` |
| Worker can't connect to SignalR | BiQuote endpoint unreachable | Set `BIQUOTE_BASE_URL` in `.env` (BiQuote is keyless) |
| `Daily AI budget exceeded` | Hit the spending cap | Wait until UTC midnight or raise `MAX_DAILY_USD` |
| Encrypted BYOK keys unreadable after restart | `ENCRYPTION_SECRET` changed | Restore the original secret or re-enter API keys in Settings |
