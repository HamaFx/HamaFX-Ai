# Self-Hosting HamaFX-Ai

This guide covers how to deploy HamaFX-Ai on your own server using Docker Compose. The provided configuration spins up the full stack including the web application, background worker, PostgreSQL (with pgvector), and Langfuse for LLM observability.

## Prerequisites

- **Docker** and **Docker Compose V2** installed on your host.
- At least 2GB of RAM (4GB recommended).
- A domain name (optional, but recommended if exposing to the internet).

## 1. Setup

Clone the repository and prepare your environment variables:

```bash
git clone https://github.com/hamafx/hamafx-ai.git
cd hamafx-ai

# Copy the example environment file
cp .env.example .env
```

## 2. Configuration

Open `.env` in your preferred editor. You must configure the following core variables at a minimum:

```bash
# Generate a random secret for NextAuth.js
# You can generate one using: openssl rand -base64 32
NEXTAUTH_SECRET="your_generated_secret_here"
NEXTAUTH_URL="http://localhost:3000"
ENCRYPTION_SECRET="random_32_byte_hex_string_here"

# (Optional) Global API Keys if you want to provide default models for users
# Users can also bring their own keys (BYOK) via the UI settings.
OPENAI_API_KEY="your_openai_key"
ANTHROPIC_API_KEY="your_anthropic_key"
GEMINI_API_KEY="your_gemini_key"
```

If you plan to use OAuth providers (Google, GitHub) or Email Magic Links (Resend), populate their respective variables in `.env`.

## 3. Starting the Stack

Start all services in detached mode:

```bash
docker compose -f docker-compose.prod.yml up -d
```

Docker will build the Next.js `app` and the `worker` containers. Once running, you can access the application at **http://localhost:3000**.

### Architecture Overview

- **`db`**: PostgreSQL 16 with the `pgvector` extension for vector embeddings.
- **`langfuse`**: LLM observability platform (accessible on port 3001).
- **`app`**: The Next.js web application (port 3000).
- **`worker`**: The background worker process. It connects to the SignalR market data stream and runs a built-in `node-cron` scheduler to process alerts, briefings, and daily/weekly jobs. Healthchecks run on port 8081.

## 4. Updates

To update your instance to the latest version:

```bash
cd hamafx-ai
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
```

Drizzle schema migrations are applied automatically when the `app` container starts.

## 5. Security & Reverse Proxy

The `docker-compose.prod.yml` binds ports 3000 (web) and 3001 (Langfuse) to `localhost` by default. For internet-facing deployments, we strongly recommend putting the stack behind a reverse proxy like **Caddy**, **Nginx**, or **Traefik** with SSL termination (HTTPS).

Example Caddyfile:
```caddyfile
hamafx.yourdomain.com {
    reverse_proxy localhost:3000
}

langfuse.yourdomain.com {
    reverse_proxy localhost:3001
}
```
