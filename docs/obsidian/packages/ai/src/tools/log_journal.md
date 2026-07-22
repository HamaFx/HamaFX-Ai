---
type: tool
package: "@hamafx/ai"
path: "packages/ai/src/tools/log-journal.ts"
incoming: 2
outgoing: 6
connections: 8
risk: low
layer: ai
tags: [type/tool, hamafx-ai, layer/ai]
aliases: [log_journal]
---

# 🔧 log_journal

> **AI Tool** · `@hamafx/ai` · `packages/ai/src/tools/log-journal.ts`


Record a trade entry in the journal. Returns the new entry id + a summary line. Status is 


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
[[@hamafx-shared]] · [[persistence-CreateJournalInput]] · [[tool-context-ToolEnv]] · [[mutation-guard-assertMutationIntent]] · [[@hamafx-ai]] · [[registry-ToolPlugin]]


### 📥 Depended On By (2)
[[journal]] · [[mutation-tools.test]]



## 📦 Exports
- `logJournalTool`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/tool` to find all AI Tools
- Use `#hamafx-ai` to find all files in this package
