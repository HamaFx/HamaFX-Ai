---
type: tool
package: "@hamafx/ai"
path: "packages/ai/src/tools/log-journal.ts"
incoming: 2
outgoing: 6
risk: low
tags: [tool, hamafxai]
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
| Risk level | LOW |


### 📤 Depends On
[[@hamafx-shared]] · [[persistence-CreateJournalInput]] · [[tool-context-ToolEnv]] · [[mutation-guard-assertMutationIntent]] · [[@hamafx-ai]] · [[registry-ToolPlugin]]


### 📥 Depended On By
[[journal]] · [[mutation-tools.test]]



## 📦 Exports
- `logJournalTool`

