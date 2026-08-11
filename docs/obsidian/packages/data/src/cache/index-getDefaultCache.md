---
type: module
package: "@kestrel/data"
path: "packages/data/src/cache/index.ts"
incoming: 4
outgoing: 5
connections: 9
risk: low
layer: core
tags: [type/module, kestrel-data, layer/core]
aliases: [index/getDefaultCache]
---

# 📁 index/getDefaultCache

> **Module** · `@kestrel/data` · `packages/data/src/cache/index.ts`


Module: packages/data/src/cache/index.ts


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 4 |
| Outgoing dependencies | 5 |
| Total connections | 9 |
| Risk level | **LOW** |
| Layer | `core` |
| Package tag | `#kestrel-data` |


### 📤 Depends On (4)
[[memory-MemoryCache]] · [[redis-RedisCache]] · [[types-CacheEntryMeta]] · [[@kestrel-data]]


### 📥 Depended On By (4)
[[candles-GetCandlesOptions]] · [[price-GetPriceOptions]] · [[cache-index.test]] · [[price-adapter.test]]



## 📦 Exports
- `getDefaultCache`
- `getDefaultCacheSync`
- `setDefaultCache`
- `clearAllTenantCaches`
- `MemoryCache`
- `RedisCache`
- `cacheKey`
- `cacheTag`
- `type CacheResource`
- `type KeyParts`
- `PRICE_TTL`
- `candleTtl`
- `NEWS_LIST_TTL`
- `NEWS_ARTICLE_TTL`
- `CALENDAR_DAY_TTL`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/module` to find all Modules
- Use `#kestrel-data` to find all files in this package
