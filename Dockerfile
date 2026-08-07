# HamaFX-Ai Docker image
# Multi-stage build: deps → build → runtime
# Uses Next.js standalone output for minimal final image.

# L-3: Base image pinned to a specific minor version for reproducible builds.
# Update to the latest Node.js 20.x minor periodically via Dependabot.
FROM node:20.18-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# ── Dependencies ──────────────────────────────────────────
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

# ── Builder ───────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/pnpm-lock.yaml ./
COPY . .

# Build only the web app (Turborepo handles transitive deps).
# Explicitly neutralize local legacy-auth settings during image creation;
# runtime authentication is still enforced by auth.config.ts/middleware.
ENV NEXT_TELEMETRY_DISABLED=1
RUN AUTH_MODE=normal pnpm turbo run build --filter=@hamafx/web...

# Prepare the small production dependency tree used by the runtime migrator.
# Next.js standalone tracing does not see this separately-run .mjs script.
RUN pnpm --filter=@hamafx/db deploy --prod /runtime/db

# ── Runner ────────────────────────────────────────────────
FROM base AS runner
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy Next.js standalone output
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

# Copy drizzle migrations and the runtime migrator for auto-migrate on boot.
COPY --from=builder /app/packages/db/drizzle ./packages/db/drizzle
COPY --from=builder /app/packages/db/drizzle.config.ts ./packages/db/drizzle.config.ts

# Keep migrator dependencies isolated from Next.js standalone's traced tree.
# ESM resolves these packages from the migrator's local node_modules.
COPY --from=builder /runtime/db/node_modules ./runtime-migrate/node_modules
COPY --from=builder /app/apps/web/scripts/migrate-runtime.mjs ./runtime-migrate/migrate-runtime.mjs
COPY --from=builder /app/apps/web/scripts/wait-for-db.mjs ./runtime-migrate/wait-for-db.mjs

# Copy entrypoint
COPY apps/web/docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]