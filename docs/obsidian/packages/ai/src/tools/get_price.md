---
type: tool
package: "@hamafx/ai"
path: "packages/ai/src/tools/get-price.ts"
incoming: 3
outgoing: 4
connections: 7
risk: low
layer: ai
tags: [type/tool, hamafx-ai, layer/ai]
aliases: [get_price]
---

# 🔧 get_price

> **AI Tool** · `@hamafx/ai` · `packages/ai/src/tools/get-price.ts`


Fetch the most recent mid price for one or more supported symbols (XAUUSD, EURUSD, GBPUSD). Use only when the LIVE_SNAPSHOT in the system prompt is missing the symbol or older than 10 seconds.


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
[[market]] · [[get-price.test]] · [[ai-data.integration.test]]



## 📦 Exports
- `getPriceTool`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/tool` to find all AI Tools
- Use `#hamafx-ai` to find all files in this package
