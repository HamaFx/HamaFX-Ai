# Lighthouse runner

Programmatic Lighthouse + chrome-launcher script that audits HamaFX-Ai's mobile UX against the Phase 1 thresholds.

> The runner script (`run.mjs`) lands in task 12.2. This README documents the conventions up front so the invocations and output layout are nailed down before any code change.

## Routes (`Lighthouse_Targets`)

Each invocation audits the same eight routes, in this order:

1. `/chat`
2. `/chart/XAUUSD`
3. `/news`
4. `/calendar`
5. `/alerts`
6. `/journal`
7. `/settings`
8. `/settings/usage`

## Thresholds

- Performance ≥ 90
- Accessibility ≥ 95

Each route is run twice; the higher performance score is kept (industry-standard noise reduction). On any threshold miss the script lists the failing route, score, and category to stdout and exits non-zero.

## Output

Reports are written to `docs/lighthouse/<UTC-timestamp>/`:

- `<route>.json` per route (full Lighthouse report)
- `summary.md` (one row per route)

A per-route JSON write failure is logged but does not abort the run.

## Auth

The runner attaches a single `Cookie` header (`hfx_auth=<value>`) via Lighthouse's `extraHeaders` so the password gate is bypassed for the duration of the audit. Obtain the cookie value by:

1. Logging in through the password gate at the target URL.
2. Opening DevTools → Application → Cookies → copy the `hfx_auth` value.

## Invocation

### Local production build

```bash
# Build and start the production server in one shell:
pnpm --filter @hamafx/web build
pnpm --filter @hamafx/web start  # serves on http://localhost:3000

# In a second shell, run the audit:
node tools/lighthouse/run.mjs \
  --base-url http://localhost:3000 \
  --cookie "hfx_auth=<value>" \
  --out docs/lighthouse
```

### Deployed Vercel URL

```bash
node tools/lighthouse/run.mjs \
  --base-url https://hama-fx-ai.vercel.app \
  --cookie "hfx_auth=<value>" \
  --out docs/lighthouse
```

## Waivers

Routes that genuinely cannot reach the thresholds are documented in [`docs/lighthouse/waivers.md`](../../docs/lighthouse/waivers.md) with a one-paragraph justification per waived route-and-category pair. While any route is below threshold and not covered by a waiver, Phase 1 completion remains blocked.

## CI

This runner is **not** wired into a CI workflow that blocks merges. It is a local measurement tool.
