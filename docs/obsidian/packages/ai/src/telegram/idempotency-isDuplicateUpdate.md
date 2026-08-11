---
type: module
package: "@kestrel/ai"
path: "packages/ai/src/telegram/idempotency.ts"
incoming: 2
outgoing: 2
connections: 4
risk: low
layer: core
tags: [type/module, kestrel-ai, layer/core]
aliases: [idempotency/isDuplicateUpdate]
---

# 📁 idempotency/isDuplicateUpdate

> **Module** · `@kestrel/ai` · `packages/ai/src/telegram/idempotency.ts`


Module: packages/ai/src/telegram/idempotency.ts


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 2 |
| Outgoing dependencies | 2 |
| Total connections | 4 |
| Risk level | **LOW** |
| Layer | `core` |
| Package tag | `#kestrel-ai` |


### 📤 Depends On (2)
[[db-getDb]] · [[@kestrel-ai]]


### 📥 Depended On By (2)
[[webhook-TelegramUpdate]] · [[telegram.test]]



## 📦 Exports
- `isDuplicateUpdate`
- `markProcessed`
- `_resetForTesting`
- `DbTelegramIdempotency`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/module` to find all Modules
- Use `#kestrel-ai` to find all files in this package
