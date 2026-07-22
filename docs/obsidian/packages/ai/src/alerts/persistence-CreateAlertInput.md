---
type: module
package: "@hamafx/ai"
path: "packages/ai/src/alerts/persistence.ts"
incoming: 5
outgoing: 5
connections: 10
risk: low
layer: core
tags: [type/module, hamafx-ai, layer/core]
aliases: [persistence/CreateAlertInput]
---

# 📁 persistence/CreateAlertInput

> **Module** · `@hamafx/ai` · `packages/ai/src/alerts/persistence.ts`


Module: packages/ai/src/alerts/persistence.ts


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 5 |
| Outgoing dependencies | 5 |
| Total connections | 10 |
| Risk level | **LOW** |
| Layer | `core` |
| Package tag | `#hamafx-ai` |


### 📤 Depends On (4)
[[@hamafx-db]] · [[db-getDb]] · [[@hamafx-shared]] · [[@hamafx-ai]]


### 📥 Depended On By (5)
[[delivery-DeliveryResult]] · [[evaluator-parseIndicatorSpec]] · [[set_alert]] · [[alert-snooze.test]] · [[alerts-evaluator-parallel.test]]



## 📦 Exports
- `CreateAlertInput`
- `listAlerts`
- `listEvaluable`
- `getAlert`
- `createAlert`
- `UpdateAlertInput`
- `updateAlert`
- `markFired`
- `markFiredSnoozed`
- `isInSnooze`
- `markFiredForAlert`
- `setRulePreviousValue`
- `deleteAlert`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/module` to find all Modules
- Use `#hamafx-ai` to find all files in this package
