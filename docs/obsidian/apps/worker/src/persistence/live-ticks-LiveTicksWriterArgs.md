---
type: module
package: "@kestrel/worker"
path: "apps/worker/src/persistence/live-ticks.ts"
incoming: 2
outgoing: 10
connections: 12
risk: low
layer: core
tags: [type/module, kestrel-worker, layer/core]
aliases: [live-ticks/LiveTicksWriterArgs]
---

# 📁 live-ticks/LiveTicksWriterArgs

> **Module** · `@kestrel/worker` · `apps/worker/src/persistence/live-ticks.ts`


Module: apps/worker/src/persistence/live-ticks.ts


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 2 |
| Outgoing dependencies | 10 |
| Total connections | 12 |
| Risk level | **LOW** |
| Layer | `core` |
| Package tag | `#kestrel-worker` |


### 📤 Depends On (6)
[[@kestrel-ai]] · [[@kestrel-db]] · [[log-Logger]] · [[consumer-NormalizedTick]] · [[tick-buffer-TickBuffer]] · [[@kestrel-worker]]


### 📥 Depended On By (2)
[[index-onShutdown]] · [[live-ticks.test]]



## 📦 Exports
- `LiveTicksWriterArgs`
- `flushLiveTicks`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/module` to find all Modules
- Use `#kestrel-worker` to find all files in this package
