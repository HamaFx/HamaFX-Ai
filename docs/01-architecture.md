# Architecture

Kestrel is a Next.js web application plus a persistent worker, organized as a pnpm/Turborepo monorepo.

## Runtime topology

- `apps/web`: Next.js App Router, authentication, API routes, chat UI, and server actions.
- `apps/worker`: persistent Node.js worker for live market data, aggregation, scheduled jobs, and health checks.
- `packages/ai`: AI runtime, BYOK provider resolution, tools, persistence, and telemetry.
- `packages/data`: market data adapters and provider failover.
- `packages/db`: Drizzle schema, migrations, PostgreSQL client, and PGlite local-development support.
- `packages/shared`: environment validation, schemas, encryption, logging, and shared errors.

## Deployment modes

### Local development

`pnpm dev:local` uses embedded PGlite and generates development secrets under `.hamafx/dev-secrets.json`. This mode is for development and evaluation, not shared production use.

### Self-hosted Docker

The Compose stack includes PostgreSQL with pgvector, the web app, and the worker. The default is single-user and binds services to loopback. Langfuse is available through the opt-in `observability` profile.

### Hosted deployment

The hosted edition may use managed PostgreSQL, Vercel, and separate worker infrastructure. Hosted billing and operational integrations are not required for the open-source self-hosted mode.

## Data flow

Browser requests pass through the request proxy for authentication, CSRF, request IDs, and security headers. Authenticated API routes derive the user from the verified session or signed proxy header. User-owned persistence uses `userId` predicates; shared PostgreSQL mode additionally uses tenant context and RLS.

## Security boundaries

The request proxy stays lightweight and does not access the database. The AI package resolves database and model dependencies through its composition boundary. Workers and cron jobs that need cross-tenant access use the dedicated admin database connection when RLS is enabled.
