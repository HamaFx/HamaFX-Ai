---
type: tool
package: "@hamafx/ai"
path: "packages/ai/src/tools/get-candles.ts"
incoming: 3
outgoing: 4
connections: 7
risk: low
layer: ai
tags: [type/tool, hamafx-ai, layer/ai]
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
| Total connections | 7 |
| Risk level | **LOW** |
| Layer | `ai` |
| Package tag | `#hamafx-ai` |


### 📤 Depends On (4)
[[@hamafx-data]] · [[@hamafx-shared]] · [[@hamafx-ai]] · [[registry-ToolPlugin]]


### 📥 Depended On By (3)
[[market]] · [[get-candles.test]] · [[ai-data.integration.test]]



## 📦 Exports
- `getCandlesTool`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/tool` to find all AI Tools
- Use `#hamafx-ai` to find all files in this package
