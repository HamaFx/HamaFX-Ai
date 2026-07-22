---
type: tool
package: "@hamafx/ai"
path: "packages/ai/src/tools/get-cot.ts"
incoming: 1
outgoing: 4
connections: 5
risk: low
layer: ai
tags: [type/tool, hamafx-ai, layer/ai]
aliases: [get_co_t]
---

# 🔧 get_co_t

> **AI Tool** · `@hamafx/ai` · `packages/ai/src/tools/get-cot.ts`


Last N weeks of CFTC Commitment-of-Traders rows for one symbol (default XAUUSD). Use to answer 


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 1 |
| Outgoing dependencies | 4 |
| Total connections | 5 |
| Risk level | **LOW** |
| Layer | `ai` |
| Package tag | `#hamafx-ai` |


### 📤 Depends On (4)
[[@hamafx-shared]] · [[persistence-UpsertCoTReportArgs]] · [[@hamafx-ai]] · [[registry-ToolPlugin]]


### 📥 Depended On By (1)
[[market]]



## 📦 Exports
- `getCoTTool`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/tool` to find all AI Tools
- Use `#hamafx-ai` to find all files in this package
