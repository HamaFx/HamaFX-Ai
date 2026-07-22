---
type: moc
package: "infra"
nodes: 1
totalIncoming: 0
totalOutgoing: 0
tags: [moc, infra]
---

# 📦 infra

> **Map of Content** · 1 files · 0 incoming + 0 outgoing = 0 connections

## DataviewJS — All Files in This Package
```dataviewjs
const pages = dv.pages().where(p => p.package === "infra" && p.type);
dv.table(
  ['File', 'Type', 'Incoming', 'Outgoing', 'Risk'],
  pages.sort(p => -(p.incoming + p.outgoing), 'desc').map(p => [
    p.file.link, p.type, p.incoming, p.outgoing,
    p.risk ? p.risk.toUpperCase() : ''
  ])
);
```

## Files by Type

### 📦 Package (1)
- [[infra]] *(0↖ 0↗)*

