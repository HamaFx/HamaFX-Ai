---
type: moc
package: "root"
nodes: 3
totalIncoming: 2
totalOutgoing: 2
tags: [moc, root]
---

# 📦 root

> **Map of Content** · 3 files · 2 incoming + 2 outgoing = 4 connections

## DataviewJS — All Files in This Package
```dataviewjs
const pages = dv.pages().where(p => p.package === "root" && p.type);
dv.table(
  ['File', 'Type', 'Incoming', 'Outgoing', 'Risk'],
  pages.sort(p => -(p.incoming + p.outgoing), 'desc').map(p => [
    p.file.link, p.type, p.incoming, p.outgoing,
    p.risk ? p.risk.toUpperCase() : ''
  ])
);
```

## Files by Type

### 📁 Module (2)
- [[vitest.config-defineConfig]] *(0↖ 1↗)*
- [[vitest.workspace-defineWorkspace]] *(0↖ 1↗)*

### 📦 Package (1)
- [[root]] *(2↖ 0↗)*

