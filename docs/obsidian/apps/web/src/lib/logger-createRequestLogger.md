---
type: module
package: "@kestrel/web"
path: "apps/web/src/lib/logger.ts"
incoming: 3
outgoing: 5
connections: 8
risk: low
layer: core
tags: [type/module, kestrel-web, layer/core]
aliases: [logger/createRequestLogger]
---

# 📁 logger/createRequestLogger

> **Module** · `@kestrel/web` · `apps/web/src/lib/logger.ts`


Module: apps/web/src/lib/logger.ts


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 3 |
| Outgoing dependencies | 5 |
| Total connections | 8 |
| Risk level | **LOW** |
| Layer | `core` |
| Package tag | `#kestrel-web` |


### 📤 Depends On (4)
[[@kestrel-shared]] · [[request-id-readOrCreateRequestId]] · [[api-RequestUser]] · [[@kestrel-web]]


### 📥 Depended On By (3)
[[admin-auth-AdminUser]] · [[api-RequestUser]] · [[cron-withCronAuth]]



## 📦 Exports
- `createRequestLogger`
- `createScopedLoggerWithContext`
- `createCategorizedLogger`
- `type CategorizedLogger`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/module` to find all Modules
- Use `#kestrel-web` to find all files in this package
