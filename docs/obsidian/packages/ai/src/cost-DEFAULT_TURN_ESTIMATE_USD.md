---
type: module
package: "@hamafx/ai"
path: "packages/ai/src/cost.ts"
incoming: 17
outgoing: 7
connections: 24
risk: medium
layer: core
tags: [type/module, hamafx-ai, layer/core, risk/medium]
aliases: [cost/DEFAULT_TURN_ESTIMATE_USD]
---

# 📁 cost/DEFAULT_TURN_ESTIMATE_USD

> **Module** · `@hamafx/ai` · `packages/ai/src/cost.ts`


Module: packages/ai/src/cost.ts


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 17 |
| Outgoing dependencies | 7 |
| Total connections | 24 |
| Risk level | **MEDIUM** |
| Layer | `core` |
| Package tag | `#hamafx-ai` |


### 📤 Depends On (6)
[[@hamafx-db]] · [[db-getDb]] · [[delivery-DeliveryResult]] · [[byok-providers]] · [[@hamafx-shared]] · [[@hamafx-ai]]


### 📥 Depended On By (17)
[[agent-runChat]] · [[me-meCommand]] · [[generate-BriefingsEnv]] · [[budget-guard-BudgetReservation]] · [[budget-reservation-BudgetHandle]] · [[resolve-model-ResolveModelContext]] · [[review-ReviewTradeArgs]] · [[memory-index-MemoryKind]] · [[thread-summary-CompactResult]] · [[base-agent-baseOpinionSchema]] · [[decision]] · [[orchestrator-RunMultiAgentArgs]] · [[telemetry-persistence-TelemetryInput]] · [[budget-guard.test]] · [[budget-race.test]] · [[cost-estimate.test]] · [[cost.test]]



## 📦 Exports
- `DEFAULT_TURN_ESTIMATE_USD`
- `DEFAULT_MAX_DAILY_USD`
- `estimateCostUsd`
- `dailySpendUsd`
- `reservedSpendUsd`
- `BudgetReservation`
- `tryReserveBudget`
- `applyBudgetDelta`
- `enforceDailyBudget`
- `BudgetExceededError`
- `getMonthlySpend`
- `getProviderMonthlySpend`
- `checkBudgetAlertsAndThresholds`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/module` to find all Modules
- Use `#hamafx-ai` to find all files in this package
