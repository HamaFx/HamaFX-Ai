---
type: module
package: "@kestrel/ai"
path: "packages/ai/src/persistence.ts"
incoming: 14
outgoing: 1
connections: 15
risk: low
layer: core
tags: [type/module, kestrel-ai, layer/core]
aliases: [persistence/listThreads]
---

# 📁 persistence/listThreads

> **Module** · `@kestrel/ai` · `packages/ai/src/persistence.ts`


Module: packages/ai/src/persistence.ts


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 14 |
| Outgoing dependencies | 1 |
| Total connections | 15 |
| Risk level | **LOW** |
| Layer | `core` |
| Package tag | `#kestrel-ai` |


### 📤 Depends On (1)
[[@kestrel-ai]]


### 📥 Depended On By (12)
[[agent-runChat]] · [[generate-BriefingsEnv]] · [[persistence-getOrCreateBriefingsThread]] · [[auto-title-runAutoTitleBackground]] · [[helpers-countToolCalls]] · [[thread-summary-CompactResult]] · [[orchestrator-RunMultiAgentArgs]] · [[summarize_thread]] · [[with-telemetry-withTelemetry]] · [[chat-helpers.test]] · [[fork-thread.test]] · [[idor-persistence.test]]



## 📦 Exports
- `listThreads`
- `getThread`
- `createThread`
- `updateThreadTitle`
- `updateThreadPinnedSymbol`
- `deleteThread`
- `deleteAllThreads`
- `forkThread`
- `deriveForkedTitle`
- `type DbThread`
- `type ForkThreadInput`
- `type ForkThreadResult`
- `listMessages`
- `appendUserMessage`
- `appendAssistantMessage`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/module` to find all Modules
- Use `#kestrel-ai` to find all files in this package
