---
type: tool
package: "@kestrel/ai"
path: "packages/ai/src/tools/get-system-diagnostics.ts"
incoming: 2
outgoing: 6
connections: 8
risk: low
layer: ai
tags: [type/tool, kestrel-ai, layer/ai]
aliases: [get_system_diagnostics]
---

# 🔧 get_system_diagnostics

> **AI Tool** · `@kestrel/ai` · `packages/ai/src/tools/get-system-diagnostics.ts`


Query the real-time operational health, connection latency, database record volumes, active synchronized files status, remaining daily budget, and verified environment variables in the Copilot system.


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 2 |
| Outgoing dependencies | 6 |
| Total connections | 8 |
| Risk level | **LOW** |
| Layer | `ai` |
| Package tag | `#kestrel-ai` |


### 📤 Depends On (6)
[[@kestrel-shared]] · [[@kestrel-db]] · [[db-getDb]] · [[tool-context-ToolEnv]] · [[@kestrel-ai]] · [[registry-ToolPlugin]]


### 📥 Depended On By (2)
[[system-toolRegistry]] · [[get-system-diagnostics.test]]



## 📦 Exports
- `getSystemDiagnosticsTool`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/tool` to find all AI Tools
- Use `#kestrel-ai` to find all files in this package
