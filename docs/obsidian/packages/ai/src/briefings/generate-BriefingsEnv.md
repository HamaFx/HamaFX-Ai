---
type: module
package: "@kestrel/ai"
path: "packages/ai/src/briefings/generate.ts"
incoming: 1
outgoing: 12
connections: 13
risk: low
layer: core
tags: [type/module, kestrel-ai, layer/core]
aliases: [generate/BriefingsEnv]
---

# 📁 generate/BriefingsEnv

> **Module** · `@kestrel/ai` · `packages/ai/src/briefings/generate.ts`


Module: packages/ai/src/briefings/generate.ts


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 1 |
| Outgoing dependencies | 12 |
| Total connections | 13 |
| Risk level | **LOW** |
| Layer | `core` |
| Package tag | `#kestrel-ai` |


### 📤 Depends On (11)
[[@kestrel-db]] · [[db-getDb]] · [[@kestrel-shared]] · [[cost-DEFAULT_TURN_ESTIMATE_USD]] · [[persistence-CreateJournalInput]] · [[memory-index-MemoryKind]] · [[model-resolveModel]] · [[persistence-listThreads]] · [[telemetry-telemetryConfig]] · [[persistence-getOrCreateBriefingsThread]] · [[@kestrel-ai]]


### 📥 Depended On By (1)
[[briefings-generate.test]]



## 📦 Exports
- `BriefingsEnv`
- `emitPreEvent`
- `emitPostEvent`
- `buildEventPrompt`
- `deterministicEventSummary`
- `surpriseLabel`
- `emitWeeklyReview`
- `deterministicWeeklyReview`
- `isoWeekKey`
- `symbolFromCurrency`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/module` to find all Modules
- Use `#kestrel-ai` to find all files in this package
