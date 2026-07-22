---
type: moc
package: "@hamafx/config"
nodes: 4
totalIncoming: 12
totalOutgoing: 4
tags: [moc, hamafx-config]
---

# 📦 @hamafx/config

> **Map of Content** · 4 files · 12 incoming + 4 outgoing = 16 connections

## DataviewJS — All Files in This Package
```dataviewjs
const pages = dv.pages().where(p => p.package === "@hamafx/config" && p.type);
dv.table(
  ['File', 'Type', 'Incoming', 'Outgoing', 'Risk'],
  pages.sort(p => -(p.incoming + p.outgoing), 'desc').map(p => [
    p.file.link, p.type, p.incoming, p.outgoing,
    p.risk ? p.risk.toUpperCase() : ''
  ])
);
```

## Files by Type

### 📁 Module (3)
- [[index-default]] *(0↖ 2↗)*
- [[index-default]] *(0↖ 1↗)*
- [[tokens-colors]] *(0↖ 1↗)*

### 📦 Package (1)
- [[@hamafx-config]] *(12↖ 0↗)*

