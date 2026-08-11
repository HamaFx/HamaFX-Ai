---
type: module
package: "@kestrel/ai"
path: "packages/ai/src/alerts/evaluator.ts"
incoming: 6
outgoing: 12
connections: 18
risk: medium
layer: core
tags: [type/module, kestrel-ai, layer/core, risk/medium]
aliases: [evaluator/parseIndicatorSpec]
---

# 📁 evaluator/parseIndicatorSpec

> **Module** · `@kestrel/ai` · `packages/ai/src/alerts/evaluator.ts`


Module: packages/ai/src/alerts/evaluator.ts


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 6 |
| Outgoing dependencies | 12 |
| Total connections | 18 |
| Risk level | **MEDIUM** |
| Layer | `core` |
| Package tag | `#kestrel-ai` |


### 📤 Depends On (10)
[[@kestrel-db]] · [[db-getDb]] · [[@kestrel-data]] · [[@kestrel-indicators]] · [[@kestrel-shared]] · [[delivery-DeliveryResult]] · [[persistence-CreateAlertInput]] · [[spec-RuleReading]] · [[rule-registry-SpecFactory]] · [[@kestrel-ai]]


### 📥 Depended On By (6)
[[delivery-DeliveryResult]] · [[alert-decide.test]] · [[alerts-evaluator-parallel.test]] · [[cross-detection.test]] · [[last-closed-bar.test]] · [[parse-indicator-spec.test]]



## 📦 Exports
- `parseIndicatorSpec`
- `lastClosedBar`
- `EvaluatorEnv`
- `EvaluationResult`
- `evaluateAlerts`
- `describeRule`
- `decideMatch`
- `decideCross`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/module` to find all Modules
- Use `#kestrel-ai` to find all files in this package
