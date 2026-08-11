---
type: tool
package: "@kestrel/ai"
path: "packages/ai/src/tools/summarize-thread.ts"
incoming: 1
outgoing: 9
connections: 10
risk: low
layer: ai
tags: [type/tool, kestrel-ai, layer/ai]
aliases: [summarize_thread]
---

# 🔧 summarize_thread

> **AI Tool** · `@kestrel/ai` · `packages/ai/src/tools/summarize-thread.ts`


One-paragraph synopsis of the active chat thread plus three durable insights. Use when the user asks


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 1 |
| Outgoing dependencies | 9 |
| Total connections | 10 |
| Risk level | **LOW** |
| Layer | `ai` |
| Package tag | `#kestrel-ai` |


### 📤 Depends On (8)
[[@kestrel-shared]] · [[memory-index-MemoryKind]] · [[model-resolveModel]] · [[persistence-listThreads]] · [[tool-context-ToolEnv]] · [[telemetry-telemetryConfig]] · [[@kestrel-ai]] · [[registry-ToolPlugin]]


### 📥 Depended On By (1)
[[journal-toolRegistry]]



## 📦 Exports
- `summarizeThreadTool`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/tool` to find all AI Tools
- Use `#kestrel-ai` to find all files in this package
