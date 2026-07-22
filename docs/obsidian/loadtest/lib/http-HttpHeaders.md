---
type: module
package: "loadtest"
path: "loadtest/lib/http.ts"
incoming: 6
outgoing: 3
connections: 9
risk: low
layer: core
tags: [type/module, loadtest, layer/core]
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
| Total connections | 9 |
| Risk level | **LOW** |
| Layer | `core` |
| Package tag | `#loadtest` |


### 📤 Depends On (3)
[[environments-SessionCtx]] · [[checks-expectOk]] · [[loadtest]]


### 📥 Depended On By (6)
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


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/module` to find all Modules
- Use `#loadtest` to find all files in this package
