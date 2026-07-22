---
type: tool
package: "@hamafx/ai"
path: "packages/ai/src/tools/compute-position-health.ts"
incoming: 2
outgoing: 6
risk: low
tags: [tool, hamafxai]
aliases: [compute_position_health]
---

# 🔧 compute_position_health

> **AI Tool** · `@hamafx/ai` · `packages/ai/src/tools/compute-position-health.ts`


For each currently-open journal entry, compute live P/L in pips and R-multiples plus distance to stop and target. Use when the user asks 


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 2 |
| Outgoing dependencies | 6 |
| Risk level | LOW |


### 📤 Depends On
[[@hamafx-data]] · [[@hamafx-shared]] · [[persistence-CreateJournalInput]] · [[tool-context-ToolEnv]] · [[@hamafx-ai]] · [[registry-ToolPlugin]]


### 📥 Depended On By
[[analysis]] · [[compute-position-health.test]]



## 📦 Exports
- `computePositionHealthTool`

