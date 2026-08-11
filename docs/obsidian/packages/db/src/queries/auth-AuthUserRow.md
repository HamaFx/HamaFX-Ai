---
type: module
package: "@kestrel/db"
path: "packages/db/src/queries/auth.ts"
incoming: 0
outgoing: 3
connections: 3
risk: low
layer: core
tags: [type/module, kestrel-db, layer/core]
aliases: [auth/AuthUserRow]
---

# 📁 auth/AuthUserRow

> **Module** · `@kestrel/db` · `packages/db/src/queries/auth.ts`


Module: packages/db/src/queries/auth.ts


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 0 |
| Outgoing dependencies | 3 |
| Total connections | 3 |
| Risk level | **LOW** |
| Layer | `core` |
| Package tag | `#kestrel-db` |


### 📤 Depends On (3)
[[@kestrel-shared]] · [[client-DbClient]] · [[@kestrel-db]]




## 📦 Exports
- `AuthUserRow`
- `getUserByEmail`
- `incrementFailedLogins`
- `resetLoginLockout`
- `CreateUserInput`
- `createUserWithSettings`
- `userExistsByEmail`
- `updateUserPassword`
- `updatePasswordByEmail`
- `createVerificationToken`
- `findVerificationToken`
- `deleteVerificationToken`
- `verifyUserEmail`
- `getTokenVersion`
- `findSession`


## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use `#type/module` to find all Modules
- Use `#kestrel-db` to find all files in this package
