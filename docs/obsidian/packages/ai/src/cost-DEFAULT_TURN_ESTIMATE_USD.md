---
type: module
package: "@hamafx/ai"
path: "packages/ai/src/cost.ts"
incoming: 17
outgoing: 7
risk: medium
tags: [module, hamafxai]
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
| Risk level | MEDIUM |


### 📤 Depends On
[[@hamafx-db]] · [[db-getDb]] · [[delivery-DeliveryResult]] · [[byok-providers]] · [[@hamafx-shared]] · [[@hamafx-ai]]


### 📥 Depended On By
[[agent-runChat]] · [[me-meCommand]] · [[generate-BriefingsEnv]] · [[budget-guard-BudgetReservation]] · [[budget-reservation-BudgetHandle]] · [[resolve-model-ResolveModelContext]] · [[review-ReviewTradeArgs]] · [[memory-index-MemoryKind]] · [[thread-summary-CompactResult]] · [[base-agent-baseOpinionSchema]] · [[decision]] · [[orchestrator-RunMultiAgentArgs]] · [[telemetry-persistence-TelemetryInput]] · [[budget-guard.test]] · [[budget-race.test]]



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

