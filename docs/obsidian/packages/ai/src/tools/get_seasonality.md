---
type: tool
package: "@hamafx/ai"
path: "packages/ai/src/tools/get-seasonality.ts"
incoming: 1
outgoing: 4
risk: low
tags: [tool, hamafxai]
aliases: [get_seasonality]
---

# 🔧 get_seasonality

> **AI Tool** · `@hamafx/ai` · `packages/ai/src/tools/get-seasonality.ts`


Per-month / per-weekday / per-hour return seasonality for a symbol. Returns median percent return, IQR, win rate, and sample count per bucket. Use for 


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 1 |
| Outgoing dependencies | 4 |
| Risk level | LOW |


### 📤 Depends On
[[@hamafx-data]] · [[@hamafx-shared]] · [[@hamafx-ai]] · [[registry-ToolPlugin]]


### 📥 Depended On By
[[market]]



## 📦 Exports
- `getSeasonalityTool`

