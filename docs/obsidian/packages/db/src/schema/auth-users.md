---
type: module
package: "@hamafx/db"
path: "packages/db/src/schema/auth.ts"
incoming: 30
outgoing: 1
connections: 31
risk: high
layer: core
tags: [type/module, hamafx-db, layer/core, risk/high]
aliases: [auth/users]
---

# 📁 auth/users

> **Module** · `@hamafx/db` · `packages/db/src/schema/auth.ts`


Database schema (9 tables)


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 30 |
| Outgoing dependencies | 1 |
| Total connections | 31 |
| Risk level | **HIGH** |
| Layer | `core` |
| Package tag | `#hamafx-db` |


### 📤 Depends On (1)
[[@hamafx-db]]


### 📥 Depended On By (30)
[[user]] · [[organization]] · [[organization_member]] · [[user_sessions]] · [[account]] · [[session]] · [[verificationToken]] · [[user_settings]] · [[user_symbols]] · [[admin-audit-adminAuditLogs]] · [[agent-opinions-agentOpinions]] · [[alerts-alerts]] · [[analysis-jobs-analysisJobs]] · [[audit-auditLogs]] · [[billing-planInterval]] · [[bot-links-botLinks]] · [[briefings-briefingsEmitted]] · [[chat-chatThreads]] · [[daily-ai-spend-dailyAiSpend]] · [[diagnostic-traces-diagnosticTraces]]
> ... and 10 more



## 📦 Exports
- `users`
- `UserRow`
- `UserInsert`
- `organization`
- `organizationMember`
- `userSessions`
- `UserSessionRow`
- `UserSessionInsert`
- `accounts`
- `AccountRow`
- `AccountInsert`
- `sessions`
- `SessionRow`
- `SessionInsert`
- `verificationTokens`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/module` to find all Modules
- Use `#hamafx-db` to find all files in this package
