---
type: tool
package: "@kestrel/ai"
path: "packages/ai/src/tools/get-candles.ts"
incoming: 3
outgoing: 4
connections: 7
risk: low
layer: ai
tags: [type/tool, kestrel-ai, layer/ai]
aliases: [get_candles]
---

# 🔧 get_candles

> **AI Tool** · `@kestrel/ai` · `packages/ai/src/tools/get-candles.ts`


Fetch OHLC candles for one symbol at one timeframe (e.g. XAUUSD 1h). Use to confirm a recent swing high/low or to feed a pattern read. For RSI/MACD/EMA/etc. prefer get_indicators.


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 3 |
| Outgoing dependencies | 4 |
| Total connections | 7 |
| Risk level | **LOW** |
| Layer | `ai` |
| Package tag | `#kestrel-ai` |


### 📤 Depends On (4)
[[@kestrel-data]] · [[@kestrel-shared]] · [[@kestrel-ai]] · [[registry-ToolPlugin]]


### 📥 Depended On By (3)
[[market-toolRegistry]] · [[get-candles.test]] · [[ai-data.integration.test]]



## 📦 Exports
- `getCandlesTool`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/tool` to find all AI Tools
- Use `#kestrel-ai` to find all files in this package
