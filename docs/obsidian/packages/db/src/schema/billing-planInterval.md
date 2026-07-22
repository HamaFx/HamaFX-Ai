---
type: module
package: "@hamafx/db"
path: "packages/db/src/schema/billing.ts"
incoming: 5
outgoing: 2
connections: 7
risk: low
layer: core
tags: [type/module, hamafx-db, layer/core]
aliases: [billing/planInterval]
---

# 📁 billing/planInterval

> **Module** · `@hamafx/db` · `packages/db/src/schema/billing.ts`


Database schema (4 tables)


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 5 |
| Outgoing dependencies | 2 |
| Total connections | 7 |
| Risk level | **LOW** |
| Layer | `core` |
| Package tag | `#hamafx-db` |


### 📤 Depends On (2)
[[auth-users]] · [[@hamafx-db]]


### 📥 Depended On By (5)
[[plans]] · [[subscriptions]] · [[payments]] · [[ipn_events]] · [[seed-plans]]



## 📦 Exports
- `planInterval`
- `subscriptionStatus`
- `paymentStatus`
- `plans`
- `subscriptions`
- `payments`
- `ipnEvents`
- `PlanRow`
- `PlanInsert`
- `SubscriptionRow`
- `SubscriptionInsert`
- `PaymentRow`
- `PaymentInsert`
- `IpnEventRow`
- `IpnEventInsert`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/module` to find all Modules
- Use `#hamafx-db` to find all files in this package
