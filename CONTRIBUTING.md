# Contributing to HamaFX-Ai

First off, thank you for considering contributing to HamaFX-Ai! It's people like you that make the open-source community such a great place to learn, inspire, and create.

This document outlines the process and standards for contributing to the project.

## Development Environment Setup

HamaFX-Ai is a Turborepo monorepo using `pnpm`.

### Prerequisites
- [Node.js](https://nodejs.org/en/download/) (v20+ recommended)
- [pnpm](https://pnpm.io/installation) (v9+)
- Docker & Docker Compose (for the database and services)

### Installation
1. Fork and clone the repository.
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Copy `.env.example` to `.env` and fill in the required variables (like `NEXTAUTH_SECRET`).
   ```bash
   cp .env.example .env
   ```
4. Start the database and backend services:
   ```bash
   docker compose up -d db langfuse
   ```
5. Apply database migrations:
   ```bash
   pnpm --filter @hamafx/db migrate:apply
   ```
6. Start the development server:
   ```bash
   pnpm dev
   ```

## Architecture Overview

HamaFX-Ai is structured as a monorepo:
- `apps/web`: The Next.js 15 frontend application.
- `apps/worker`: The Node.js background worker for polling and heavy jobs.
- `packages/ai`: The core AI agent orchestration and tool definitions.
- `packages/data`: Data layer integrations (BiQuote, Finnhub, Marketaux, FRED).
- `packages/db`: Drizzle ORM schemas and database clients.
- `packages/indicators`: Pure TypeScript trading indicators.
- `packages/shared`: Shared types, schemas, and utilities.

## Code Style

We use `eslint` and `prettier` to enforce code style.

- Run the linter before submitting your PR:
  ```bash
  pnpm lint
  ```
- Run typechecking:
  ```bash
  pnpm typecheck
  ```

## Branching and Commits

- Create a new branch for your work: `git checkout -b feat/your-feature` or `fix/your-fix`.
- We use [Conventional Commits](https://www.conventionalcommits.org/). Please format your commit messages accordingly:
  - `feat: add new indicator`
  - `fix(web): correct chart layout`
  - `docs: update deployment guide`

## Pull Request Process

1. Ensure all tests pass (`pnpm test`).
2. Ensure linting and typechecking pass.
3. Update any relevant documentation in `docs/` and `README.md`.
4. Open a Pull Request using the provided template.
5. A maintainer will review your code. Please address any feedback promptly.

## Testing

When contributing new features or fixing bugs, please add or update the corresponding tests. We use Vitest for unit and integration testing.

```bash
pnpm test
```

## Finding Work

If you are looking for a way to contribute, check the issue tracker for the `good first issue` or `help wanted` labels.

Thank you for contributing!
