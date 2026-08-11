---
type: module
package: "@kestrel/ai"
path: "packages/ai/src/journal/persistence.ts"
incoming: 6
outgoing: 6
connections: 12
risk: low
layer: core
tags: [type/module, kestrel-ai, layer/core]
aliases: [persistence/CreateJournalInput]
---

# 📁 persistence/CreateJournalInput

> **Module** · `@kestrel/ai` · `packages/ai/src/journal/persistence.ts`


Module: packages/ai/src/journal/persistence.ts


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 6 |
| Outgoing dependencies | 6 |
| Total connections | 12 |
| Risk level | **LOW** |
| Layer | `core` |
| Package tag | `#kestrel-ai` |


### 📤 Depends On (5)
[[@kestrel-db]] · [[db-getDb]] · [[@kestrel-shared]] · [[memory-index-MemoryKind]] · [[@kestrel-ai]]


### 📥 Depended On By (6)
[[generate-BriefingsEnv]] · [[review-ReviewTradeArgs]] · [[compute_position_health]] · [[get_journal_stats]] · [[log_journal]] · [[journal-stats.test]]



## 📦 Exports
- `CreateJournalInput`
- `listEntries`
- `getEntry`
- `createEntry`
- `UpdateJournalInput`
- `updateEntry`
- `deleteEntry`
- `computeRMultiple`
- `summarize`
- `computeStats`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/module` to find all Modules
- Use `#kestrel-ai` to find all files in this package
