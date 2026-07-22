---
type: tool
package: "@hamafx/ai"
path: "packages/ai/src/tools/get-indicators.ts"
incoming: 1
outgoing: 5
risk: low
tags: [tool, hamafxai]
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
| Risk level | LOW |


### 📤 Depends On
[[@hamafx-data]] · [[@hamafx-indicators]] · [[@hamafx-shared]] · [[@hamafx-ai]] · [[registry-ToolPlugin]]


### 📥 Depended On By
[[market]]



## 📦 Exports
- `getIndicatorsTool`

