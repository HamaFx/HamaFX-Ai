---
type: tool
package: "@hamafx/ai"
path: "packages/ai/src/tools/get-indicators.ts"
incoming: 1
outgoing: 5
connections: 6
risk: low
layer: ai
tags: [type/tool, hamafx-ai, layer/ai]
aliases: [get_indicators]
---

# 🔧 get_indicators

> **AI Tool** · `@hamafx/ai` · `packages/ai/src/tools/get-indicators.ts`


Compute indicators (sma, ema, rsi, macd, atr, bollinger, pivots) on a (symbol, timeframe) window. Returns the last 30 points of each series — enough for 


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 1 |
| Outgoing dependencies | 5 |
| Total connections | 6 |
| Risk level | **LOW** |
| Layer | `ai` |
| Package tag | `#hamafx-ai` |


### 📤 Depends On (5)
[[@hamafx-data]] · [[@hamafx-indicators]] · [[@hamafx-shared]] · [[@hamafx-ai]] · [[registry-ToolPlugin]]


### 📥 Depended On By (1)
[[market]]



## 📦 Exports
- `getIndicatorsTool`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/tool` to find all AI Tools
- Use `#hamafx-ai` to find all files in this package
