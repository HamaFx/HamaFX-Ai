---
type: tool
package: "@hamafx/ai"
path: "packages/ai/src/tools/run-system-action.ts"
incoming: 2
outgoing: 8
connections: 10
risk: low
layer: ai
tags: [type/tool, hamafx-ai, layer/ai]
aliases: [run_system_action]
---

# 🔧 run_system_action

> **AI Tool** · `@hamafx/ai` · `packages/ai/src/tools/run-system-action.ts`


Trigger the operator-only FRED resonance historical sync. This tool is only for explicit user requests to run the resonance backfill/sync and is unavailable for canned cache or migration theatrics.


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 2 |
| Outgoing dependencies | 8 |
| Total connections | 10 |
| Risk level | **LOW** |
| Layer | `ai` |
| Package tag | `#hamafx-ai` |


### 📤 Depends On (8)
[[@hamafx-shared]] · [[@hamafx-data]] · [[@hamafx-db]] · [[db-getDb]] · [[tool-context-ToolEnv]] · [[mutation-guard-assertMutationIntent]] · [[@hamafx-ai]] · [[registry-ToolPlugin]]


### 📥 Depended On By (2)
[[system]] · [[run-system-action.test]]



## 📦 Exports
- `runSystemActionTool`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/tool` to find all AI Tools
- Use `#hamafx-ai` to find all files in this package
