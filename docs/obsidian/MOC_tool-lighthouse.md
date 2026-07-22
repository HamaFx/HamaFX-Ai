---
type: moc
package: "tool:lighthouse"
nodes: 2
totalIncoming: 1
totalOutgoing: 1
tags: [moc, tool:lighthouse]
---

# 📦 tool:lighthouse

> **Map of Content** · 2 files · 1 incoming + 1 outgoing = 2 connections

## DataviewJS — All Files in This Package
```dataviewjs
const pages = dv.pages().where(p => p.package === "tool:lighthouse" && p.type);
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
- [[tool-lighthouse]] *(1↖ 0↗)*

### 📁 Module (1)
- [[run]] *(0↖ 1↗)*

