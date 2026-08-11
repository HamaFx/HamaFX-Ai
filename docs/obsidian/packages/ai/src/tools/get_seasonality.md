---
type: tool
package: "@kestrel/ai"
path: "packages/ai/src/tools/get-seasonality.ts"
incoming: 1
outgoing: 4
connections: 5
risk: low
layer: ai
tags: [type/tool, kestrel-ai, layer/ai]
aliases: [get_seasonality]
---

# 🔧 get_seasonality

> **AI Tool** · `@kestrel/ai` · `packages/ai/src/tools/get-seasonality.ts`


Per-month / per-weekday / per-hour return seasonality for a symbol. Returns median percent return, IQR, win rate, and sample count per bucket. Use for


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 1 |
| Outgoing dependencies | 4 |
| Total connections | 5 |
| Risk level | **LOW** |
| Layer | `ai` |
| Package tag | `#kestrel-ai` |


### 📤 Depends On (4)
[[@kestrel-data]] · [[@kestrel-shared]] · [[@kestrel-ai]] · [[registry-ToolPlugin]]


### 📥 Depended On By (1)
[[market-toolRegistry]]



## 📦 Exports
- `getSeasonalityTool`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/tool` to find all AI Tools
- Use `#kestrel-ai` to find all files in this package
