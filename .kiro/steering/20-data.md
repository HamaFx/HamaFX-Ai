---
inclusion: fileMatch
fileMatchPattern: 'packages/data/**'
---

# Steering: data providers

When working in `packages/data/**`:

1. **Provider adapters live under** `packages/data/src/providers/<name>/{rest,map}.ts`.
2. **Public API of the package is the adapters**, not the providers. UI / route handlers / AI tools call `adapters.candles.get(...)`, never `providers.twelveData.get(...)`.
3. Every adapter call goes through:
   - Zod input validation
   - `Cache` (Next.js Data Cache by default — see `packages/data/src/cache/`), TTLs per `docs/06-data-sources.md`
   - **Stale-while-revalidate** (Phase 7a): adapters set `maxStaleSeconds` to opt into serving cached values past TTL when the upstream producer fails. Use `*WithMeta` siblings (`getPriceWithMeta`, `getCandlesWithMeta`) when the route handler / UI needs the freshness flag.
   - **Health-aware ordering** (Phase 7a): `runWithFailover` reorders attempts by per-provider success rate over a 5-minute rolling window. Caller order is preserved on score ties.
   - **Adaptive throttle** (Phase 7a): when a provider returns 429 the client calls `noteBackoff(provider, cfg)`; the next reservation sees a tightened cap for `cfg.cooloffMs`. Wired into all four provider clients.
   - Primary provider → fallback on error
   - Stale-while-error if `maxStaleSeconds > 0`
4. Outputs are always normalised DTOs from `@shared/schemas/*`.
5. Each result must include `source` and `fetchedAt`.
6. Provider symbol mapping lives in `<provider>/map.ts` and is the only place mapping happens.
7. **No WebSocket clients** in personal-mode MVP — REST only. (We only used WS in the original plan when a worker existed.) If WS becomes necessary later, that's a sign we should add `apps/worker/`.
8. Add MSW mocks in tests — never hit live APIs in unit tests.
9. Track per-provider usage with a small in-memory throttle bucket (`packages/data/src/cache/throttle.ts`) so we don't burn free-tier quotas. When near limit, prefer cached/stale.
