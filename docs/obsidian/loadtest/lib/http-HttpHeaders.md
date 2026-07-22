---
type: module
package: "loadtest"
path: "loadtest/lib/http.ts"
incoming: 6
outgoing: 3
risk: low
tags: [module, loadtest]
aliases: [http/HttpHeaders]
---

# 📁 http/HttpHeaders

> **Module** · `loadtest` · `loadtest/lib/http.ts`


Module: loadtest/lib/http.ts


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 6 |
| Outgoing dependencies | 3 |
| Risk level | LOW |


### 📤 Depends On
[[environments-SessionCtx]] · [[checks-expectOk]] · [[loadtest]]


### 📥 Depended On By
[[http-server-HealthServerDeps]] · [[chat-chatTurn]] · [[config-mix-configMix]] · [[market-read-marketRead]] · [[read-mix-readMix]] · [[write-mix-writeMix]]



## 📦 Exports
- `HttpHeaders`
- `setCsrfHeader`
- `getJson`
- `postJson`
- `patchJson`
- `putJson`
- `deleteReq`
- `getJsonSafe`

