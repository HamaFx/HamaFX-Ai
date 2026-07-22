---
type: tool
package: "@hamafx/ai"
path: "packages/ai/src/tools/get-seasonality.ts"
incoming: 1
outgoing: 4
connections: 5
risk: low
layer: ai
tags: [type/tool, hamafx-ai, layer/ai]
aliases: [get_seasonality]
---

# 🔧 get_seasonality

> **AI Tool** · `@hamafx/ai` · `packages/ai/src/tools/get-seasonality.ts`


Per-month / per-weekday / per-hour return seasonality for a symbol. Returns median percent return, IQR, win rate, and sample count per bucket. Use for 


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 1 |
| Outgoing dependencies | 4 |
| Total connections | 5 |
| Risk level | **LOW** |
| Layer | `ai` |
| Package tag | `#hamafx-ai` |


### 📤 Depends On (4)
[[@hamafx-data]] · [[@hamafx-shared]] · [[@hamafx-ai]] · [[registry-ToolPlugin]]


### 📥 Depended On By (1)
[[market]]



## 📦 Exports
- `getSeasonalityTool`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/tool` to find all AI Tools
- Use `#hamafx-ai` to find all files in this package
