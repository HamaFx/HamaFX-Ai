---
type: tool
package: "@kestrel/ai"
path: "packages/ai/src/tools/log-journal.ts"
incoming: 2
outgoing: 6
connections: 8
risk: low
layer: ai
tags: [type/tool, kestrel-ai, layer/ai]
aliases: [log_journal]
---

# 🔧 log_journal

> **AI Tool** · `@kestrel/ai` · `packages/ai/src/tools/log-journal.ts`


Record a trade entry in the journal. Returns the new entry id + a summary line. Status is


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
[[@kestrel-shared]] · [[persistence-CreateJournalInput]] · [[tool-context-ToolEnv]] · [[mutation-guard-assertMutationIntent]] · [[@kestrel-ai]] · [[registry-ToolPlugin]]


### 📥 Depended On By (2)
[[journal-toolRegistry]] · [[mutation-tools.test]]



## 📦 Exports
- `logJournalTool`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/tool` to find all AI Tools
- Use `#kestrel-ai` to find all files in this package
