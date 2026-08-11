---
type: tool
package: "@kestrel/ai"
path: "packages/ai/src/tools/annotate-chart.ts"
incoming: 1
outgoing: 5
connections: 6
risk: low
layer: ai
tags: [type/tool, kestrel-ai, layer/ai]
aliases: [annotate_chart]
---

# 🔧 annotate_chart

> **AI Tool** · `@kestrel/ai` · `packages/ai/src/tools/annotate-chart.ts`


Compute chart annotations (swings, BOS/CHoCH, FVG, order blocks, liquidity sweeps, previous-day high/low, Asian session range) for a symbol/timeframe. Use when the user asks to


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 1 |
| Outgoing dependencies | 5 |
| Total connections | 6 |
| Risk level | **LOW** |
| Layer | `ai` |
| Package tag | `#kestrel-ai` |


### 📤 Depends On (5)
[[@kestrel-data]] · [[@kestrel-indicators]] · [[@kestrel-shared]] · [[@kestrel-ai]] · [[registry-ToolPlugin]]


### 📥 Depended On By (1)
[[analysis-toolRegistry]]



## 📦 Exports
- `annotateChartTool`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/tool` to find all AI Tools
- Use `#kestrel-ai` to find all files in this package
