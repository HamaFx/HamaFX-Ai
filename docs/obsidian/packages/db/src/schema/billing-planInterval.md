---
type: module
package: "@kestrel/db"
path: "packages/db/src/schema/billing.ts"
incoming: 7
outgoing: 2
connections: 9
risk: low
layer: core
tags: [type/module, kestrel-db, layer/core]
aliases: [billing/planInterval]
---

# 📁 billing/planInterval

> **Module** · `@kestrel/db` · `packages/db/src/schema/billing.ts`


Database schema (6 tables)


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 7 |
| Outgoing dependencies | 2 |
| Total connections | 9 |
| Risk level | **LOW** |
| Layer | `core` |
| Package tag | `#kestrel-db` |


### 📤 Depends On (2)
[[auth-users]] · [[@kestrel-db]]


### 📥 Depended On By (7)
[[plans]] · [[subscriptions]] · [[payments]] · [[ipn_events]] · [[billing_webhook_dlq]] · [[billing_checkout_attempts]] · [[seed-plans]]



## 📦 Exports
- `planInterval`
- `subscriptionStatus`
- `paymentStatus`
- `plans`
- `subscriptions`
- `payments`
- `ipnEvents`
- `billingWebhookDlq`
- `billingCheckoutAttempts`
- `PlanRow`
- `PlanInsert`
- `SubscriptionRow`
- `SubscriptionInsert`
- `PaymentRow`
- `PaymentInsert`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/module` to find all Modules
- Use `#kestrel-db` to find all files in this package
