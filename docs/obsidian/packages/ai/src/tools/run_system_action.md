---
type: tool
package: "@hamafx/ai"
path: "packages/ai/src/tools/run-system-action.ts"
incoming: 2
outgoing: 8
risk: low
tags: [tool, hamafxai]
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
| Risk level | LOW |


### 📤 Depends On
[[@hamafx-shared]] · [[@hamafx-data]] · [[@hamafx-db]] · [[db-getDb]] · [[tool-context-ToolEnv]] · [[mutation-guard-assertMutationIntent]] · [[@hamafx-ai]] · [[registry-ToolPlugin]]


### 📥 Depended On By
[[system]] · [[run-system-action.test]]



## 📦 Exports
- `runSystemActionTool`

