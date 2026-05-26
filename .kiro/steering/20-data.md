---
inclusion: fileMatch
fileMatchPattern: 'packages/data/**'
---

# Steering: data providers

When working in `packages/data/**`:

1. **Provider adapters live under** `packages/data/src/providers/<name>/{rest,ws,map}.ts`.
2. **Public API of the package is the adapters**, not the providers. UI / route handlers / AI tools call `adapters.candles.get(...)`, never `providers.twelveData.get(...)`.
3. Every adapter call goes through:
   - Zod input validation
   - Upstash cache (TTL per `docs/06-data-sources.md`)
   - Primary provider → fallback on error
   - Stale-while-error if `maxStaleMs > 0`
4. Outputs are always normalised DTOs from `@shared/schemas/*`.
5. Each result must include `source` and `fetchedAt`.
6. Provider symbol mapping lives in `<provider>/map.ts` and is the only place mapping happens.
7. WebSockets are **worker-only**. Browser / Vercel never speaks directly to a provider WS.
8. Add MSW mocks in tests — never hit live APIs in unit tests.
