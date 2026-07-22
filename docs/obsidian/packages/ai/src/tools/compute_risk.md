---
type: tool
package: "@hamafx/ai"
path: "packages/ai/src/tools/compute-risk.ts"
incoming: 4
outgoing: 3
risk: low
tags: [tool, hamafxai]
aliases: [compute_risk]
---

# 🔧 compute_risk

> **AI Tool** · `@hamafx/ai` · `packages/ai/src/tools/compute-risk.ts`


Compute position size, USD risk/reward, and pips-to-stop/target from a (symbol, side, entry, stop, target?, accountUsd, riskPct) tuple. Pure-function — no provider calls. Use when the user asks 


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 4 |
| Outgoing dependencies | 3 |
| Risk level | LOW |


### 📤 Depends On
[[@hamafx-shared]] · [[@hamafx-ai]] · [[registry-ToolPlugin]]


### 📥 Depended On By
[[analysis]] · [[convene_committee]] · [[compute-risk.test]] · [[ai-data.integration.test]]



## 📦 Exports
- `computeRiskTool`

