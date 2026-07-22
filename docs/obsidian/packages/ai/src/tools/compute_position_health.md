---
type: tool
package: "@hamafx/ai"
path: "packages/ai/src/tools/compute-position-health.ts"
incoming: 2
outgoing: 6
connections: 8
risk: low
layer: ai
tags: [type/tool, hamafx-ai, layer/ai]
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
| Total connections | 8 |
| Risk level | **LOW** |
| Layer | `ai` |
| Package tag | `#hamafx-ai` |


### 📤 Depends On (6)
[[@hamafx-data]] · [[@hamafx-shared]] · [[persistence-CreateJournalInput]] · [[tool-context-ToolEnv]] · [[@hamafx-ai]] · [[registry-ToolPlugin]]


### 📥 Depended On By (2)
[[analysis]] · [[compute-position-health.test]]



## 📦 Exports
- `computePositionHealthTool`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/tool` to find all AI Tools
- Use `#hamafx-ai` to find all files in this package
