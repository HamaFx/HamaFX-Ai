---
type: tool
package: "@hamafx/ai"
path: "packages/ai/src/tools/get-system-diagnostics.ts"
incoming: 2
outgoing: 6
risk: low
tags: [tool, hamafxai]
aliases: [get_system_diagnostics]
---

# 🔧 get_system_diagnostics

> **AI Tool** · `@hamafx/ai` · `packages/ai/src/tools/get-system-diagnostics.ts`


Query the real-time operational health, connection latency, database record volumes, active synchronized files status, remaining daily budget, and verified environment variables in the Copilot system.


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 2 |
| Outgoing dependencies | 6 |
| Risk level | LOW |


### 📤 Depends On
[[@hamafx-shared]] · [[@hamafx-db]] · [[db-getDb]] · [[tool-context-ToolEnv]] · [[@hamafx-ai]] · [[registry-ToolPlugin]]


### 📥 Depended On By
[[system]] · [[get-system-diagnostics.test]]



## 📦 Exports
- `getSystemDiagnosticsTool`

