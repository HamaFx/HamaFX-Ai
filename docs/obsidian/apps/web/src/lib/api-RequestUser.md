---
type: module
package: "@kestrel/web"
path: "apps/web/src/lib/api.ts"
incoming: 4
outgoing: 7
connections: 11
risk: low
layer: core
tags: [type/module, kestrel-web, layer/core]
aliases: [api/RequestUser]
---

# 📁 api/RequestUser

> **Module** · `@kestrel/web` · `apps/web/src/lib/api.ts`


Module: apps/web/src/lib/api.ts


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 4 |
| Outgoing dependencies | 7 |
| Total connections | 11 |
| Risk level | **LOW** |
| Layer | `core` |
| Package tag | `#kestrel-web` |


### 📤 Depends On (7)
[[@kestrel-data]] · [[@kestrel-shared]] · [[logger-createRequestLogger]] · [[auth-anomaly-recordAuthEvent]] · [[request-id-readOrCreateRequestId]] · [[signed-user-header-USER_ID_HEADER]] · [[@kestrel-web]]


### 📥 Depended On By (3)
[[logger-createRequestLogger]] · [[api-payload-size.test]] · [[api.test]]



## 📦 Exports
- `RequestUser`
- `getUserFromRequest`
- `GET`
- `withAuth`
- `ApiErrorBody`
- `errorResponse`
- `parseSearchParams`
- `Middleware`
- `compose`
- `authMiddleware`
- `parseJsonBody`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/module` to find all Modules
- Use `#kestrel-web` to find all files in this package
