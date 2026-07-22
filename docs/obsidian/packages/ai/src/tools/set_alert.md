---
type: tool
package: "@hamafx/ai"
path: "packages/ai/src/tools/set-alert.ts"
incoming: 2
outgoing: 7
connections: 9
risk: low
layer: ai
tags: [type/tool, hamafx-ai, layer/ai]
aliases: [set_alert]
---

# 🔧 set_alert

> **AI Tool** · `@hamafx/ai` · `packages/ai/src/tools/set-alert.ts`


Create a one-shot price / indicator / candle-close alert. Fires when the rule first matches and then deactivates. The user can resend by editing the alert in /alerts.


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 2 |
| Outgoing dependencies | 7 |
| Total connections | 9 |
| Risk level | **LOW** |
| Layer | `ai` |
| Package tag | `#hamafx-ai` |


### 📤 Depends On (7)
[[@hamafx-shared]] · [[persistence-CreateAlertInput]] · [[tool-context-ToolEnv]] · [[mutation-guard-assertMutationIntent]] · [[rule-registry-SpecFactory]] · [[@hamafx-ai]] · [[registry-ToolPlugin]]


### 📥 Depended On By (2)
[[journal]] · [[mutation-tools.test]]



## 📦 Exports
- `setAlertTool`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/tool` to find all AI Tools
- Use `#hamafx-ai` to find all files in this package
