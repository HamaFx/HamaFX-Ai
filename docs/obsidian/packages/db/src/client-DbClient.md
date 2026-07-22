---
type: module
package: "@hamafx/db"
path: "packages/db/src/client.ts"
incoming: 35
outgoing: 2
risk: high
tags: [module, hamafxdb]
aliases: [client/DbClient]
---

# 📁 client/DbClient

> **Module** · `@hamafx/db` · `packages/db/src/client.ts`


Module: packages/db/src/client.ts


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 35 |
| Outgoing dependencies | 2 |
| Risk level | HIGH |


### 📤 Depends On
[[index_tool-architecture-explorer|index]] · [[@hamafx-db]]


### 📥 Depended On By
[[seed-plans]] · [[local-db-getLocalDb]] · [[provider-quota-DailyQuotaResult]] · [[agent-opinions-AgentOpinionRow]] · [[alerts-AlertRow]] · [[analysis-jobs-AnalysisJobRow]] · [[auth-AuthUserRow]] · [[billing-extras-listActivePlans]] · [[candles-CandleRow]] · [[chat-telemetry-listToolTelemetry]] · [[cot-CotReportRow]] · [[cron-runs-CronRunRow]] · [[diagnostic-traces-DiagnosticTraceRow]] · [[feature-flags-FeatureFlagRow]] · [[ipn-events-findIpnEvent]]



## 📦 Exports
- `DbClient`
- `getDbRO`
- `getDb`
- `closeReplicaDb`
- `closeDb`
- `withTenantDb`
- `withTenantDbRO`
- `withDbRetry`
- `checkDbHealth`
- `getAdminDb`
- `closeAdminDb`

