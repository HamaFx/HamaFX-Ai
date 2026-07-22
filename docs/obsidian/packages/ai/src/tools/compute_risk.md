---
type: tool
package: "@hamafx/ai"
path: "packages/ai/src/tools/compute-risk.ts"
incoming: 4
outgoing: 3
connections: 7
risk: low
layer: ai
tags: [type/tool, hamafx-ai, layer/ai]
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
| Total connections | 7 |
| Risk level | **LOW** |
| Layer | `ai` |
| Package tag | `#hamafx-ai` |


### 📤 Depends On (3)
[[@hamafx-shared]] · [[@hamafx-ai]] · [[registry-ToolPlugin]]


### 📥 Depended On By (4)
[[analysis]] · [[convene_committee]] · [[compute-risk.test]] · [[ai-data.integration.test]]



## 📦 Exports
- `computeRiskTool`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/tool` to find all AI Tools
- Use `#hamafx-ai` to find all files in this package
