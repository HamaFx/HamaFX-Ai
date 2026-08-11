---
type: module
package: "@kestrel/db"
path: "packages/db/src/client.ts"
incoming: 37
outgoing: 2
connections: 39
risk: high
layer: core
tags: [type/module, kestrel-db, layer/core, risk/high]
aliases: [client/DbClient]
---

# 📁 client/DbClient

> **Module** · `@kestrel/db` · `packages/db/src/client.ts`


Module: packages/db/src/client.ts


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 37 |
| Outgoing dependencies | 2 |
| Total connections | 39 |
| Risk level | **HIGH** |
| Layer | `core` |
| Package tag | `#kestrel-db` |


### 📤 Depends On (2)
[[index_tool-architecture-explorer|index]] · [[@kestrel-db]]


### 📥 Depended On By (36)
[[seed-plans]] · [[local-db-getLocalDb]] · [[provider-quota-DailyQuotaResult]] · [[admin-audit-recordAdminAudit]] · [[agent-opinions-AgentOpinionRow]] · [[alerts-AlertRow]] · [[analysis-jobs-AnalysisJobRow]] · [[auth-AuthUserRow]] · [[billing-extras-listActivePlans]] · [[candles-CandleRow]] · [[chat-telemetry-listToolTelemetry]] · [[cot-CotReportRow]] · [[cron-runs-CronRunRow]] · [[diagnostic-traces-DiagnosticTraceRow]] · [[feature-flags-FeatureFlagRow]] · [[ipn-events-IpnClaim]] · [[journal-JournalRow]] · [[news-articles-NewsArticleRow]] · [[onboarding-ResetMode]] · [[portfolio-PositionRow]]
> ... and 16 more



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
- `schema`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/module` to find all Modules
- Use `#kestrel-db` to find all files in this package
