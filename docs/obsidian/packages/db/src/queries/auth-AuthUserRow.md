---
type: module
package: "@hamafx/db"
path: "packages/db/src/queries/auth.ts"
incoming: 0
outgoing: 2
connections: 2
risk: low
layer: core
tags: [type/module, hamafx-db, layer/core]
aliases: [auth/AuthUserRow]
---

# 📁 auth/AuthUserRow

> **Module** · `@hamafx/db` · `packages/db/src/queries/auth.ts`


Module: packages/db/src/queries/auth.ts


## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | 0 |
| Outgoing dependencies | 2 |
| Total connections | 2 |
| Risk level | **LOW** |
| Layer | `core` |
| Package tag | `#hamafx-db` |


### 📤 Depends On (2)
[[client-DbClient]] · [[@hamafx-db]]




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
- Use `#hamafx-db` to find all files in this package
