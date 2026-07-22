---
type: moc
package: "scripts"
nodes: 7
totalIncoming: 6
totalOutgoing: 6
tags: [moc, scripts]
---

# 📦 scripts

> **Map of Content** · 7 files · 6 incoming + 6 outgoing = 12 connections

## DataviewJS — All Files in This Package
```dataviewjs
const pages = dv.pages().where(p => p.package === "scripts" && p.type);
dv.table(
  ['File', 'Type', 'Incoming', 'Outgoing', 'Risk'],
  pages.sort(p => -(p.incoming + p.outgoing), 'desc').map(p => [
    p.file.link, p.type, p.incoming, p.outgoing,
    p.risk ? p.risk.toUpperCase() : ''
  ])
);
```

## Files by Type

### 📁 Module (6)
- [[add-license]] *(0↖ 1↗)*
- [[check-console-errors]] *(0↖ 1↗)*
- [[check-test-files]] *(0↖ 1↗)*
- [[dev]] *(0↖ 1↗)*
- [[predeploy-migrate]] *(0↖ 1↗)*
- [[setup]] *(0↖ 1↗)*

### 📦 Package (1)
- [[scripts]] *(6↖ 0↗)*

