# Plan 01 — Consolidate the Market-Data Provider Layer

**Covers findings:** OCP-1, OCP-2, SRP-2, LSP-2 (see `docs/audit/solid-findings.md`).
**Package:** `packages/data`.
**Est. blast radius:** `packages/data` internals + one web route. No DTO/schema changes.

---

## 1. The problem (with citations)

There are **two competing abstractions for the same concept**, and each of the
four providers is implemented twice:

1. **Fat interface** — `packages/data/src/providers/market-data-provider.ts:19-33`
   (`id`, `displayName`, `testConnection`, **required** `fetchTick`, **required**
   `fetchCandles`). Implemented in
   `packages/data/src/providers/market-data-providers.ts` as `biquoteProvider`,
   `finnhubProvider`, `liveTicksProvider`, `binanceProvider`, plus the
   `MARKET_DATA_PROVIDERS` map. Only consumer:
   `apps/web/src/app/api/settings/test-market-provider/route.ts:37,45`
   (uses `testConnection`).
2. **Thin plugin interface** — `packages/data/src/providers/provider-registry.ts:46-67`
   (`name`, `label`, `pinned`, `fetchPrice`, **optional** `fetchCandles`).
   Implemented **again** for the same four providers in
   `packages/data/src/providers/provider-adapters.ts:40-115`, auto-registered
   into the `marketDataProviders` singleton.

Consequences:
- **OCP-1:** `packages/data/src/adapters/price.ts:121-150` builds attempts from
  `marketDataProviders.list()` (registry-driven, good), but
  `packages/data/src/adapters/candles.ts:111-238` **hardcodes** providers via an
  `if`-ladder (`if (tf==='1m')`, `if (isCrypto)`, `if (def.category!=='crypto'
  && tf!=='1w')`, `if (keys.finnhub)`) with direct
  `import * as biquote/binance/finnhub` (`candles.ts:42-48`). Adding a provider
  requires editing `candles.ts` by hand.
- **OCP-2:** adding a provider means writing two adapters against two interfaces
  and registering in two places.
- **SRP-2:** `candles.ts` inlines the raw-bar → `Candle` (`CandleSchema.parse`)
  mapping four near-identical times (`~131, ~157, ~189, ~215`).
- **LSP-2:** `market-data-providers.ts:159-161` — the `live-ticks` `fetchCandles`
  **throws** for `tf !== '1m'`, violating the fat interface's promise that
  `fetchCandles` returns `Promise<Candle[]>` for any `Timeframe`.

---

## 2. Target design (minimal)

**One provider contract** — extend the existing registry plugin
(`provider-registry.ts`) so it is the single source of truth. Do **not** invent a
new abstraction; grow the one that's already registry-driven and OCP-friendly.

Add two **optional capability methods** to the `MarketDataProvider` interface in
`provider-registry.ts`:

```ts
export interface MarketDataProvider {
  readonly name: string;
  readonly label: string;
  readonly pinned?: boolean;
  fetchPrice(symbol: Symbol, opts?: ProviderFetchOptions): Promise<{
    price: number; provider: string; ageMs?: number | null;
  }>;
  /** Returns null when the provider cannot serve this symbol/timeframe. */
  fetchCandles?(symbol: Symbol, tf: Timeframe, count: number, opts?: ProviderFetchOptions): Promise<Candle[] | null>;
  /** Optional connectivity probe for the settings "test provider" button. */
  testConnection?(opts?: ProviderFetchOptions): Promise<{ ok: boolean; error?: string }>;
  /** Optional per-provider guard: can this provider serve this symbol/tf at all? */
  supports?(symbol: Symbol, tf?: Timeframe): boolean;
}
```

Key design decisions (kept deliberately small):
- `fetchCandles` stays **optional and returns `Candle[] | null`** — this is how a
  provider says "I can't serve this" **without throwing** (fixes LSP-2). The
  candles adapter skips `null`.
- `testConnection` becomes an **optional capability** on the single interface, so
  the web route keeps working without the parallel fat interface.
- One shared mapper `toCandle(...)` replaces the four inline `CandleSchema.parse`
  blocks (fixes SRP-2).
- Provider selection policy (crypto→binance, forex→biquote→finnhub, 1m→candles-1m)
  moves **into each provider's `supports()` / `fetchCandles()`**, so `candles.ts`
  just iterates `marketDataProviders.list()` like `price.ts` does.

---

## 3. Implementation sequence

1. **Add a shared candle mapper.** Create
   `packages/data/src/providers/to-candle.ts` exporting
   `toCandle(raw, { symbol, tf, source, fetchedAt })` that runs the existing
   `CandleSchema.parse({...})`. Cover both raw shapes currently mapped in
   `candles.ts`: the `{ t,o,h,l,c,v }` shape (binance/finnhub/candles-1m) and the
   biquote `{ openTime, open, high, low, close, volume }` shape (add a thin
   `toCandleFromBiquote`). No behavior change — copy the exact field logic,
   including `v: bar.volume > 0 ? bar.volume : null` for biquote.
2. **Extend the registry interface** in `provider-registry.ts:46-67` with the
   optional `fetchCandles`/`testConnection`/`supports` members shown above.
3. **Enrich the registry adapters** in `provider-adapters.ts` so each provider
   implements the capabilities it actually has, using `to-candle.ts`:
   - `liveTicksProvider`: add `fetchCandles` that returns candles for `tf==='1m'`
     via `fetchCandles1m`, and **returns `null` otherwise** (no throw). Add
     `supports(symbol, tf) => tf === '1m'` for candles. Add `testConnection`.
   - `binanceProvider`: add `fetchCandles` (crypto only — return `null` when
     `!getSymbolDefinition(symbol)?.binance`). Add `testConnection`.
   - `biquoteProvider`: add `fetchCandles` (non-crypto, `tf !== '1w'` → else
     `null`). Add `testConnection`.
   - `createFinnhubProvider`: add `fetchCandles` (requires key → `null`/throw
     `PROVIDER_NO_API_KEY` consistent with its `fetchPrice`). Add `testConnection`.
   - Register `candles-1m` behavior inside `liveTicksProvider` (it already wraps
     live ticks); keep the existing `pinned: true`.
4. **Rewrite `candles.ts` to be registry-driven.** Replace the hardcoded
   `attempts.push(...)` ladder (`candles.ts:116-238`) with:
   ```ts
   const providers = marketDataProviders.list();
   const attempts = providers
     .filter((p) => typeof p.fetchCandles === 'function' && (p.supports?.(symbol, tf) ?? true))
     .map((p) => ({
       name: p.name,
       pinned: p.pinned ?? false,
       run: async () => {
         const c = await p.fetchCandles!(symbol, tf, count, { ...opts, apiKey: keys.finnhub, baseUrl: keys.biquoteBaseUrl });
         if (!c) throw new ProviderEmptyError(p.name, 'provider returned null for symbol/tf');
         return c;
       },
     }));
   ```
   Preserve the existing `opts.marketDataProvider` pin-override logic
   (`candles.ts:248-256`) and the `NO_PROVIDER_AVAILABLE` empty-attempts error
   (`candles.ts:239-245`). Keep the `fetchWithMeta` cache wrapper and the return
   shape `{ candles, stale, producedAt }` **exactly** as-is.
5. **Repoint the web route.** In
   `apps/web/src/app/api/settings/test-market-provider/route.ts`, replace
   `MARKET_DATA_PROVIDERS[body.provider].testConnection(...)` with
   `marketDataProviders.get(body.provider).testConnection?.(...)`, returning a
   clear error if the provider has no `testConnection`.
6. **Delete the duplicate abstraction.** Remove
   `packages/data/src/providers/market-data-provider.ts` and
   `packages/data/src/providers/market-data-providers.ts`, and delete their
   re-exports from `packages/data/src/index.ts:73-80` (the
   `type MarketDataProvider`, `MARKET_DATA_PROVIDERS`, and the four `*Provider`
   exports). Keep the registry exports at `index.ts:84-88`. If any external
   caller imported `IMarketDataProvider` (the registry alias at `index.ts:85`),
   leave that alias intact.

---

## 4. What NOT to change (scope boundary)

- **Do not** touch `price.ts`'s behavior — it already consumes the registry
  correctly. Only confirm it still compiles against the extended interface.
- **Do not** change the `Candle`/`Tick` DTOs, `CandleSchema`, or any Zod schema in
  `@hamafx/shared`.
- **Do not** change the cache layer (`cache/*`), `runWithFailover`, or the
  `ProviderAttempt` type (`failover.ts:48-57`).
- **Do not** touch the news/macro/COT providers (`marketaux`, `fred`, `cftc`) —
  they are namespace-exported (`index.ts:69-72`) and are out of scope.
- **Do not** add a Polygon/Alpha-Vantage provider in this change; the goal is the
  seam, not new providers.
- **Do not** rename `marketDataProviders` or its registry class (external imports
  exist).

---

## 5. Verification

- **Typecheck:** `pnpm --filter @hamafx/data typecheck` and `pnpm typecheck`
  (catches the removed-export fallout in the web route).
- **Data unit tests:** `pnpm --filter @hamafx/data test`. Pay special attention
  to: `test/failover.test.ts`, `test/failover-pinned.test.ts`,
  `test/chaos-failover.test.ts`, `test/candles-1m-provider.test.ts`,
  `test/finnhub-candles-map.test.ts`. Update any test that imported
  `MARKET_DATA_PROVIDERS` / the deleted fat interface to use the registry.
- **Web tests:** `pnpm --filter @hamafx/web test` — confirm the
  `test-market-provider` route test still passes (adjust the mock to the
  registry lookup).
- **Manual checks:**
  1. `getCandles` for a crypto symbol (e.g. `BTCUSDT`, `1h`) returns Binance
     candles; for a forex symbol (e.g. `XAUUSD`, `1h`) returns BiQuote, falling
     back to Finnhub when `FINNHUB_API_KEY` is set.
  2. `getCandles(sym, '1m')` prefers the pinned `candles-1m`/live-ticks source.
  3. Hitting `/api/settings/test-market-provider` for each provider returns
     `{ ok: true|false }` (no 500 from a missing `testConnection`).
  4. Requesting `live-ticks` candles at a non-1m timeframe **no longer throws** —
     it is simply skipped (LSP-2 fixed).
- **Grep gate:** `grep -rn "MARKET_DATA_PROVIDERS\|market-data-providers'" packages apps --include=*.ts`
  returns nothing (dup fully removed).
