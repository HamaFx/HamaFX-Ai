---
type: tool
package: "@kestrel/ai"
path: "packages/ai/src/tools/compute-position-health.ts"
incoming: 2
outgoing: 6
connections: 8
risk: low
layer: ai
tags: [type/tool, kestrel-ai, layer/ai]
aliases: [compute_position_health]
---

# 🔧 compute_position_health

> **AI Tool** · `@kestrel/ai` · `packages/ai/src/tools/compute-position-health.ts`


For each currently-open journal entry, compute live P/L in pips and R-multiples plus distance to stop and target. Use when the user asks


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 2 |
| Outgoing dependencies | 6 |
| Total connections | 8 |
| Risk level | **LOW** |
| Layer | `ai` |
| Package tag | `#kestrel-ai` |


### 📤 Depends On (6)
[[@kestrel-data]] · [[@kestrel-shared]] · [[persistence-CreateJournalInput]] · [[tool-context-ToolEnv]] · [[@kestrel-ai]] · [[registry-ToolPlugin]]


### 📥 Depended On By (2)
[[analysis-toolRegistry]] · [[compute-position-health.test]]



## 📦 Exports
- `computePositionHealthTool`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/tool` to find all AI Tools
- Use `#kestrel-ai` to find all files in this package
