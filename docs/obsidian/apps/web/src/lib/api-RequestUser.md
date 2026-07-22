---
type: module
package: "@hamafx/web"
path: "apps/web/src/lib/api.ts"
incoming: 4
outgoing: 7
risk: low
tags: [module, hamafxweb]
aliases: [api/RequestUser]
---

# 📁 api/RequestUser

> **Module** · `@hamafx/web` · `apps/web/src/lib/api.ts`


Module: apps/web/src/lib/api.ts


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 4 |
| Outgoing dependencies | 7 |
| Risk level | LOW |


### 📤 Depends On
[[@hamafx-data]] · [[@hamafx-shared]] · [[logger-createRequestLogger]] · [[auth-anomaly-recordAuthEvent]] · [[request-id-readOrCreateRequestId]] · [[signed-user-header-USER_ID_HEADER]] · [[@hamafx-web]]


### 📥 Depended On By
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

