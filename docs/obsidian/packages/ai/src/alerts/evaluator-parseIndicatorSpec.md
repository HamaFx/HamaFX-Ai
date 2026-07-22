---
type: module
package: "@hamafx/ai"
path: "packages/ai/src/alerts/evaluator.ts"
incoming: 6
outgoing: 12
connections: 18
risk: medium
layer: core
tags: [type/module, hamafx-ai, layer/core, risk/medium]
aliases: [evaluator/parseIndicatorSpec]
---

# 📁 evaluator/parseIndicatorSpec

> **Module** · `@hamafx/ai` · `packages/ai/src/alerts/evaluator.ts`


Module: packages/ai/src/alerts/evaluator.ts


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 6 |
| Outgoing dependencies | 12 |
| Total connections | 18 |
| Risk level | **MEDIUM** |
| Layer | `core` |
| Package tag | `#hamafx-ai` |


### 📤 Depends On (10)
[[@hamafx-db]] · [[db-getDb]] · [[@hamafx-data]] · [[@hamafx-indicators]] · [[@hamafx-shared]] · [[delivery-DeliveryResult]] · [[persistence-CreateAlertInput]] · [[spec-RuleReading]] · [[rule-registry-SpecFactory]] · [[@hamafx-ai]]


### 📥 Depended On By (6)
[[delivery-DeliveryResult]] · [[alert-decide.test]] · [[alerts-evaluator-parallel.test]] · [[cross-detection.test]] · [[last-closed-bar.test]] · [[parse-indicator-spec.test]]



## 📦 Exports
- `parseIndicatorSpec`
- `lastClosedBar`
- `EvaluatorEnv`
- `EvaluationResult`
- `evaluateAlerts`
- `describeRule`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/module` to find all Modules
- Use `#hamafx-ai` to find all files in this package
