---
type: tool
package: "@kestrel/ai"
path: "packages/ai/src/tools/get-indicators.ts"
incoming: 1
outgoing: 5
connections: 6
risk: low
layer: ai
tags: [type/tool, kestrel-ai, layer/ai]
aliases: [get_indicators]
---

# 🔧 get_indicators

> **AI Tool** · `@kestrel/ai` · `packages/ai/src/tools/get-indicators.ts`


Compute indicators (sma, ema, rsi, macd, atr, bollinger, pivots) on a (symbol, timeframe) window. Returns the last 30 points of each series — enough for


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
[[market-toolRegistry]]



## 📦 Exports
- `getIndicatorsTool`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/tool` to find all AI Tools
- Use `#kestrel-ai` to find all files in this package
