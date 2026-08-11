---
type: moc
package: "@kestrel/data"
nodes: 66
totalIncoming: 198
totalOutgoing: 239
tags: [moc, kestrel-data]
---

# 📦 @kestrel/data

> **Map of Content** · 66 files · 198 incoming + 239 outgoing = 437 connections

## DataviewJS — All Files in This Package
```dataviewjs
const pages = dv.pages().where(p => p.package === "@kestrel/data" && p.type);
dv.table(
  ['File', 'Type', 'Incoming', 'Outgoing', 'Risk'],
  pages.sort(p => -(p.incoming + p.outgoing), 'desc').map(p => [
    p.file.link, p.type, p.incoming, p.outgoing,
    p.risk ? p.risk.toUpperCase() : ''
  ])
);
```

## Files by Type

### 📁 Module (65)
- [[provider-adapters-bootstrapMarketDataProviders]] *(0↖ 12↗)*
- [[price-adapter.test]] *(0↖ 9↗)*
- [[rest-fetchCandles]] *(1↖ 8↗)*
- [[rest-fetchTick]] *(1↖ 8↗)*
- [[index-FetchCandles1mArgs]] *(2↖ 7↗)*
- [[index-FetchLiveTickArgs]] *(3↖ 7↗)*
- [[candles-GetCandlesOptions]] *(0↖ 6↗)*
- [[news-FetchNewsOptions]] *(1↖ 6↗)*
- [[rest-fetchPrice]] *(1↖ 6↗)*
- [[price-GetPriceOptions]] *(1↖ 5↗)*
- [[index-getDefaultCache]] *(4↖ 5↗)*
- [[redis-RedisCache]] *(3↖ 5↗)*
- [[biquote-map.test]] *(0↖ 5↗)*
- [[biquote-rest.test]] *(0↖ 5↗)*
- [[chaos-failover.test]] *(0↖ 5↗)*
- [[failover-pinned.test]] *(0↖ 5↗)*
- [[failover.test]] *(0↖ 5↗)*
- [[storage.test]] *(0↖ 5↗)*
- [[throttle-postgres.test]] *(0↖ 5↗)*
- [[calendar-FetchCalendarOptions]] *(1↖ 4↗)*
- [[failover-ProviderAttempt]] *(6↖ 4↗)*
- [[map-toBiquoteSymbol]] *(2↖ 4↗)*
- [[to-candle-StandardBar]] *(2↖ 4↗)*
- [[binance-map.test]] *(0↖ 4↗)*
- [[calendar-adapter.test]] *(0↖ 4↗)*
- [[candles-1m-provider.test]] *(0↖ 4↗)*
- [[finnhub-candles-map.test]] *(0↖ 4↗)*
- [[live-ticks-provider.test]] *(0↖ 4↗)*
- [[news-adapter.test]] *(0↖ 4↗)*
- [[keys-CacheResource]] *(0↖ 3↗)*
- [[memory-MemoryCache]] *(4↖ 3↗)*
- [[throttle-ThrottleConfig]] *(12↖ 3↗)*
- [[ttl-TtlPolicy]] *(0↖ 3↗)*
- [[filter-assertSupportedSymbol]] *(2↖ 3↗)*
- [[map-toCftcName]] *(0↖ 3↗)*
- [[rest-CftcRow]] *(0↖ 3↗)*
- [[map-FredReleaseMeta]] *(0↖ 3↗)*
- [[rest-FredReleaseDate]] *(1↖ 3↗)*
- [[map-extractSymbols]] *(1↖ 3↗)*
- [[rest-DEFAULT_SEARCH]] *(0↖ 3↗)*
- [[provider-registry-ProviderFetchOptions]] *(3↖ 3↗)*
- [[cache-index.test]] *(0↖ 3↗)*
- [[cache-memory.test]] *(0↖ 3↗)*
- [[cache-swr-inflight.test]] *(0↖ 3↗)*
- [[health.test]] *(0↖ 3↗)*
- [[marketaux-map.test]] *(0↖ 3↗)*
- [[throttle.test]] *(0↖ 3↗)*
- [[to-candle.test]] *(0↖ 3↗)*
- [[eslint.config-config]] *(0↖ 2↗)*
- [[errors-DataErrorCode]] *(22↖ 2↗)*
- [[health-recordSuccess]] *(6↖ 2↗)*
- [[map-toBinanceInterval]] *(2↖ 2↗)*
- [[map-toFinnhubSymbol]] *(2↖ 2↗)*
- [[resonance-IntermarketResonanceInputData]] *(0↖ 2↗)*
- [[storage-SupabaseStorageEnv]] *(3↖ 1↗)*
- [[types-CacheEntryMeta]] *(6↖ 1↗)*
- [[index-getPrice]] *(0↖ 1↗)*
- [[index-fetchCandles]] *(1↖ 1↗)*
- [[types-BinanceKline]] *(1↖ 1↗)*
- [[index-fetchTick]] *(1↖ 1↗)*
- [[index-fetchLatestRows]] *(0↖ 1↗)*
- [[index-fetchPrice]] *(2↖ 1↗)*
- [[index-fetchReleaseDates]] *(1↖ 1↗)*
- [[index-fetchLatest]] *(1↖ 1↗)*
- [[vitest.config-defineConfig]] *(0↖ 1↗)*

### 📦 Package (1)
- [[@kestrel-data]] *(99↖ 0↗)*

