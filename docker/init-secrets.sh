#!/usr/bin/env bash
# docker/init-secrets.sh — Generate random secrets for Docker deployment.
#
# Creates a .env file in the repo root with cryptographically random values
# for all required secrets. Safe to re-run — existing .env is never overwritten.
#
# The actual generation lives in scripts/setup/lib/generate-env.mjs, which is
# the SINGLE source of truth shared with `pnpm setup`. This script only needs
# Node.js (>= 20.11), which is already a project prerequisite.
#
# Usage:
#   ./docker/init-secrets.sh
#   docker compose up -d

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

exec node "$ROOT/scripts/setup/lib/generate-env.mjs" --if-missing
