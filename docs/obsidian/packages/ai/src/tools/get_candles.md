---
type: tool
package: "@hamafx/ai"
path: "packages/ai/src/tools/get-candles.ts"
incoming: 3
outgoing: 4
risk: low
tags: [tool, hamafxai]
aliases: [get_candles]
---

# 🔧 get_candles

> **AI Tool** · `@hamafx/ai` · `packages/ai/src/tools/get-candles.ts`


Fetch OHLC candles for one symbol at one timeframe (e.g. XAUUSD 1h). Use to confirm a recent swing high/low or to feed a pattern read. For RSI/MACD/EMA/etc. prefer get_indicators.


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 3 |
| Outgoing dependencies | 4 |
| Risk level | LOW |


### 📤 Depends On
[[@hamafx-data]] · [[@hamafx-shared]] · [[@hamafx-ai]] · [[registry-ToolPlugin]]


### 📥 Depended On By
[[market]] · [[get-candles.test]] · [[ai-data.integration.test]]



## 📦 Exports
- `getCandlesTool`

