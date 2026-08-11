---
type: module
package: "@kestrel/db"
path: "packages/db/src/queries/ipn-events.ts"
incoming: 0
outgoing: 2
connections: 2
risk: low
layer: core
tags: [type/module, kestrel-db, layer/core]
aliases: [ipn-events/IpnClaim]
---

# 📁 ipn-events/IpnClaim

> **Module** · `@kestrel/db` · `packages/db/src/queries/ipn-events.ts`


Module: packages/db/src/queries/ipn-events.ts


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 0 |
| Outgoing dependencies | 2 |
| Total connections | 2 |
| Risk level | **LOW** |
| Layer | `core` |
| Package tag | `#kestrel-db` |


### 📤 Depends On (2)
[[client-DbClient]] · [[@kestrel-db]]




## 📦 Exports
- `IpnClaim`
- `claimIpnEvent`
- `findIpnEvent`
- `insertIpnEvent`
- `markIpnProcessed`
- `markIpnFailed`
- `recordBillingWebhookFailure`
- `countStaleBillingWebhookFailures`
- `getBillingWebhookFailure`
- `claimBillingWebhookReplay`
- `markBillingWebhookReplayed`
- `releaseBillingWebhookReplay`
- `updatePaymentStatus`
- `getPaymentByNowpaymentsId`
- `SubscriptionStatus`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/module` to find all Modules
- Use `#kestrel-db` to find all files in this package
