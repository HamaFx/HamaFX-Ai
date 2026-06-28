# Contributing to HamaFX-Ai

First off, thank you for considering contributing to HamaFX-Ai! It's people like you that make the open-source community such a great place to learn, inspire, and create.

## Development Environment Setup

HamaFX-Ai is a Turborepo monorepo using `pnpm`.

### Prerequisites

- [Node.js](https://nodejs.org/) v20+ 
- [pnpm](https://pnpm.io/installation) v9+
- Docker & Docker Compose (optional — for full-feature local dev with pgvector)

### Installation

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/HamaFx/HamaFX-Ai.git
   cd HamaFX-Ai
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Set up your environment:
   ```bash
   cp .env.example .env.local
   # Add at least one AI provider key, e.g.:
   echo 'GOOGLE_GENERATIVE_AI_API_KEY=AIza...' >> .env.local
   ```
   In development, auth secrets (`AUTH_SECRET`, `ENCRYPTION_SECRET`, `CRON_SECRET`) auto-generate to `.hamafx/dev-secrets.json`. See [docs/13-first-run-setup.md](docs/13-first-run-setup.md) for details.

4. Start the development server:
   ```bash
   # Zero-setup local dev (PGlite embedded Postgres)
   pnpm dev:local

   # Or with Docker (full features, pgvector)
   docker compose -f docker-compose.prod.yml up -d
   pnpm dev
   ```

5. Open http://localhost:3000

## Architecture Overview

HamaFX-Ai is structured as a monorepo:

- `apps/web`: Next.js 15 PWA (frontend + API routes + NextAuth)
- `apps/worker`: Node.js background worker (SignalR consumer, tick processing, scheduled jobs)
- `packages/ai`: AI agent core — chat orchestration, 30 tools, model routing, memory, persistence
- `packages/data`: Market data integrations (BiQuote, Finnhub, Marketaux, FRED) with failover
- `packages/db`: Drizzle ORM schemas (27 tables) and database clients (Postgres + PGlite)
- `packages/indicators`: Pure TypeScript trading indicators (RSI, MACD, SMC structure)
- `packages/shared`: Cross-boundary Zod schemas, env validation, error types, encryption
- `packages/config`: Shared ESLint, Prettier, TS configs
- `packages/test-utils`: Shared test factories, mocks, vitest helpers

See [docs/AGENTS.md](docs/AGENTS.md) for the full development guide.

## Code Style

We use `eslint` and `prettier` to enforce code style.

```bash
pnpm lint          # run linter
pnpm typecheck     # typecheck all packages
pnpm format        # format with prettier
```

## Branching and Commits

- Create a new branch for your work: `git checkout -b feat/your-feature` or `fix/your-fix`.
- We use [Conventional Commits](https://www.conventionalcommits.org/):
  - `feat: add new indicator`
  - `fix(web): correct chart layout`
  - `docs: update deployment guide`

## Pull Request Process

1. Ensure all tests pass: `pnpm turbo run test -- --run`
2. Ensure linting and typechecking pass: `pnpm lint && pnpm typecheck`
3. Update any relevant documentation in `docs/` and `README.md`.
4. Open a Pull Request using the provided template.
5. A maintainer will review your code. Please address any feedback promptly.

## Testing

When contributing new features or fixing bugs, please add or update the corresponding tests. We use Vitest for unit/integration testing and Playwright for E2E.

```bash
pnpm turbo run test -- --run          # all tests
pnpm --filter @hamafx/web test        # single package
pnpm --filter @hamafx/web exec playwright test  # E2E
```

See [docs/09-testing.md](docs/09-testing.md) for detailed testing patterns.

## Multi-User Architecture

HamaFX-Ai is multi-tenant. When building new features:

1. **User Isolation**: Every database query must include `.where(eq(schema.someTable.userId, currentUserId))`.
2. **Context Passing**: The NextAuth `session.user.id` is extracted in API routes via `withAuth()` and passed through to backend services using `AsyncLocalStorage` or direct function arguments.
3. **BYOK**: Do not rely on global API keys. The system decrypts user-specific API keys dynamically from `user_settings` using `ENCRYPTION_SECRET`.

## Creating AI Tools

If you are adding a new AI tool to `packages/ai`:

1. Define the input parameters using `zod`.
2. Implement the `execute` function, reading `userId` from `getToolContext()`.
3. Format the return value per the `ToolOutputMap` convention.
4. Register the tool in the tool index.
5. Update the system prompt instructions to teach the model how to use your tool.
6. Add tests for the execute function.

## Finding Work

Check the issue tracker for `good first issue` or `help wanted` labels.

Thank you for contributing!
