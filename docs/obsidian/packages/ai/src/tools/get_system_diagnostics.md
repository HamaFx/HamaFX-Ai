---
type: tool
package: "@hamafx/ai"
path: "packages/ai/src/tools/get-system-diagnostics.ts"
incoming: 2
outgoing: 6
connections: 8
risk: low
layer: ai
tags: [type/tool, hamafx-ai, layer/ai]
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
| Total connections | 8 |
| Risk level | **LOW** |
| Layer | `ai` |
| Package tag | `#hamafx-ai` |


### 📤 Depends On (6)
[[@hamafx-shared]] · [[@hamafx-db]] · [[db-getDb]] · [[tool-context-ToolEnv]] · [[@hamafx-ai]] · [[registry-ToolPlugin]]


### 📥 Depended On By (2)
[[system]] · [[get-system-diagnostics.test]]



## 📦 Exports
- `getSystemDiagnosticsTool`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/tool` to find all AI Tools
- Use `#hamafx-ai` to find all files in this package
