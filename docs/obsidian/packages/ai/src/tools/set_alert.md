---
type: tool
package: "@hamafx/ai"
path: "packages/ai/src/tools/set-alert.ts"
incoming: 2
outgoing: 7
risk: low
tags: [tool, hamafxai]
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
| Risk level | LOW |


### 📤 Depends On
[[@hamafx-shared]] · [[persistence-CreateAlertInput]] · [[tool-context-ToolEnv]] · [[mutation-guard-assertMutationIntent]] · [[rule-registry-SpecFactory]] · [[@hamafx-ai]] · [[registry-ToolPlugin]]


### 📥 Depended On By
[[journal]] · [[mutation-tools.test]]



## 📦 Exports
- `setAlertTool`

