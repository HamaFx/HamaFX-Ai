---
type: tool
package: "@hamafx/ai"
path: "packages/ai/src/tools/get-price.ts"
incoming: 3
outgoing: 4
risk: low
tags: [tool, hamafxai]
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
| Risk level | LOW |


### 📤 Depends On
[[@hamafx-data]] · [[@hamafx-shared]] · [[@hamafx-ai]] · [[registry-ToolPlugin]]


### 📥 Depended On By
[[market]] · [[get-price.test]] · [[ai-data.integration.test]]



## 📦 Exports
- `getPriceTool`

