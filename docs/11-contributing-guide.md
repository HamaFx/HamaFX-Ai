# Contributing Guide & Architecture Deep Dive

Welcome to HamaFX-Ai! This guide is intended for developers who want to understand the system architecture in detail before contributing.

## Monorepo Structure

HamaFX-Ai is built as a Turborepo. Our packages are intentionally decoupled:

- **`apps/web`**: Next.js 15 application. Handles the UI, API routes, NextAuth integration, and chat interactions.
- **`apps/worker`**: Node.js worker that connects to SignalR for tick data, and runs `systemd`-like scheduled jobs (cron) for per-user briefings and alerts.
- **`packages/ai`**: The Vercel AI SDK wrapper. This contains the `runChat` orchestrator and the 32 AI tools. It is heavily scoped by `userId` to ensure data isolation.
- **`packages/data`**: Market data integrations (Finnhub, BiQuote, Marketaux). It handles failover logic and intelligent caching.
- **`packages/db`**: The Drizzle ORM schema and clients. This is the source of truth for all database tables and relations.
- **`packages/indicators`**: Pure TypeScript implementations of financial indicators (RSI, MACD, SMC).
- **`packages/shared`**: Cross-boundary schemas (Zod), environment variable validation, and error types.

## Multi-User Architecture

HamaFX-Ai was originally built as a single-user personal copilot but has transitioned to a fully multi-tenant system.

When building new features, always adhere to these rules:

1. **User Isolation**: Every database query must include `.where(eq(schema.someTable.userId, currentUserId))`.
2. **Context Passing**: The NextAuth `session.user.id` is extracted in API routes via `withAuth` and passed through to backend services (like the AI agent) using `AsyncLocalStorage` or direct function arguments.
3. **Bring Your Own Key (BYOK)**: Do not rely on global API keys. The system decrypts the user's specific API keys dynamically from the `user_settings` table using the `ENCRYPTION_SECRET`.

## Running the Development Environment

1. Setup the database with PGlite (used for local native dev) or Docker Compose (Postgres + pgvector).
2. Start the development server using `pnpm dev:local` for the standalone script, or `pnpm dev` with Turborepo.
3. Access the application at `http://localhost:3000`.

## Testing

We mandate high test coverage. We use:
- **Vitest**: For unit and integration tests inside each package.
- **Playwright**: For End-to-End tests simulating multi-user interaction inside `apps/web/tests/e2e`.

Run tests with:
```bash
pnpm test
```

## Creating AI Tools

If you are adding a new AI tool to `packages/ai`:
1. Define the input parameters using `zod`.
2. Implement the `execute` function, making sure to read `userId` from context.
3. Format the return value correctly.
4. Update the `runChat` prompt instructions to teach the model how to use your new tool.

Happy coding!
