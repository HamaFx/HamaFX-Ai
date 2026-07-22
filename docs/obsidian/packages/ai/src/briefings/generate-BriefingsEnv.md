---
type: module
package: "@hamafx/ai"
path: "packages/ai/src/briefings/generate.ts"
incoming: 1
outgoing: 12
risk: low
tags: [module, hamafxai]
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
| Risk level | LOW |


### 📤 Depends On
[[@hamafx-db]] · [[db-getDb]] · [[@hamafx-shared]] · [[cost-DEFAULT_TURN_ESTIMATE_USD]] · [[persistence-CreateJournalInput]] · [[memory-index-MemoryKind]] · [[model]] · [[persistence]] · [[telemetry-telemetryConfig]] · [[persistence-getOrCreateBriefingsThread]] · [[@hamafx-ai]]


### 📥 Depended On By
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

