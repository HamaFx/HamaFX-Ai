---
type: module
package: "@kestrel/data"
path: "packages/data/src/failover.ts"
incoming: 6
outgoing: 4
connections: 10
risk: low
layer: core
tags: [type/module, kestrel-data, layer/core]
aliases: [failover/ProviderAttempt]
---

# 📁 failover/ProviderAttempt

> **Module** · `@kestrel/data` · `packages/data/src/failover.ts`


Module: packages/data/src/failover.ts


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 6 |
| Outgoing dependencies | 4 |
| Total connections | 10 |
| Risk level | **LOW** |
| Layer | `core` |
| Package tag | `#kestrel-data` |


### 📤 Depends On (4)
[[errors-DataErrorCode]] · [[health-recordSuccess]] · [[@kestrel-shared]] · [[@kestrel-data]]


### 📥 Depended On By (6)
[[candles-GetCandlesOptions]] · [[news-FetchNewsOptions]] · [[price-GetPriceOptions]] · [[chaos-failover.test]] · [[failover-pinned.test]] · [[failover.test]]



## 📦 Exports
- `ProviderAttempt`
- `runWithFailover`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/module` to find all Modules
- Use `#kestrel-data` to find all files in this package
