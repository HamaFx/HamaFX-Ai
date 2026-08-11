---
type: tool
package: "@kestrel/ai"
path: "packages/ai/src/tools/share-snapshot.ts"
incoming: 2
outgoing: 7
connections: 9
risk: low
layer: ai
tags: [type/tool, kestrel-ai, layer/ai]
aliases: [share_snapshot]
---

# 🔧 share_snapshot

> **AI Tool** · `@kestrel/ai` · `packages/ai/src/tools/share-snapshot.ts`


Copyright 2026 Kestrel


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 2 |
| Outgoing dependencies | 7 |
| Total connections | 9 |
| Risk level | **LOW** |
| Layer | `ai` |
| Package tag | `#kestrel-ai` |


### 📤 Depends On (7)
[[@kestrel-shared]] · [[persistence-CreateSnapshotArgs]] · [[sign-ShareTokenPayload]] · [[tool-context-ToolEnv]] · [[mutation-guard-assertMutationIntent]] · [[@kestrel-ai]] · [[registry-ToolPlugin]]


### 📥 Depended On By (2)
[[journal-toolRegistry]] · [[mutation-tools.test]]



## 📦 Exports
- `shareSnapshotTool`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/tool` to find all AI Tools
- Use `#kestrel-ai` to find all files in this package
