---
type: module
package: "@hamafx/ai"
path: "packages/ai/src/briefings/generate.ts"
incoming: 1
outgoing: 12
connections: 13
risk: low
layer: core
tags: [type/module, hamafx-ai, layer/core]
aliases: [generate/BriefingsEnv]
---

# 📁 generate/BriefingsEnv

> **Module** · `@hamafx/ai` · `packages/ai/src/briefings/generate.ts`


Module: packages/ai/src/briefings/generate.ts


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 1 |
| Outgoing dependencies | 12 |
| Total connections | 13 |
| Risk level | **LOW** |
| Layer | `core` |
| Package tag | `#hamafx-ai` |


### 📤 Depends On (11)
[[@hamafx-db]] · [[db-getDb]] · [[@hamafx-shared]] · [[cost-DEFAULT_TURN_ESTIMATE_USD]] · [[persistence-CreateJournalInput]] · [[memory-index-MemoryKind]] · [[model]] · [[persistence]] · [[telemetry-telemetryConfig]] · [[persistence-getOrCreateBriefingsThread]] · [[@hamafx-ai]]


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
- Use `#hamafx-ai` to find all files in this package
