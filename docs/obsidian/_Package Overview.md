---
type: dashboard
title: "Package Overview"
tags: [dashboard, overview]
---

# 📦 Package Dependency Matrix

> Each package has a dedicated **Map of Content (MOC)** below.

| Package | Nodes | Incoming Deps | Outgoing Deps | Layers |
|---------|-------|--------------|--------------|--------|
| @kestrel/web | 684 | 1006 | 1390 | package, core, api, ui |
| @kestrel/ai | 274 | 932 | 1304 | package, core, ai |
| @kestrel/db | 161 | 397 | 261 | package, core, data |
| @kestrel/shared | 85 | 770 | 253 | package, core |
| @kestrel/data | 66 | 198 | 239 | package, core |
| @kestrel/worker | 58 | 200 | 278 | package, core |
| @kestrel/indicators | 39 | 101 | 159 | package, core |
| loadtest | 31 | 144 | 143 | package, core |
| scripts | 25 | 65 | 65 | package, core |
| @kestrel/test-utils | 19 | 307 | 36 | package, core |
| tool:architecture-explorer | 18 | 68 | 68 | package, core |
| @kestrel/config | 4 | 12 | 4 | package, core |
| root | 3 | 2 | 2 | package, core |
| tool:lighthouse | 2 | 1 | 1 | package, core |
| docs | 1 | 0 | 0 | package |
| infra | 1 | 0 | 0 | package |

## Package MOCs

- [[MOC_-kestrel-ai]]
- [[MOC_-kestrel-config]]
- [[MOC_-kestrel-data]]
- [[MOC_-kestrel-db]]
- [[MOC_-kestrel-indicators]]
- [[MOC_-kestrel-shared]]
- [[MOC_-kestrel-test-utils]]
- [[MOC_-kestrel-web]]
- [[MOC_-kestrel-worker]]
- [[MOC_docs]]
- [[MOC_infra]]
- [[MOC_loadtest]]
- [[MOC_root]]
- [[MOC_scripts]]
- [[MOC_tool-architecture-explorer]]
- [[MOC_tool-lighthouse]]

## DataviewJS — Cross-Package Heatmap
```dataviewjs
const pages = dv.pages().where(p => p.type && p.type !== 'dashboard' && p.type !== 'index');
const pkgGroups = pages.groupBy(p => p.package || '(root)');
dv.table(
  ['Package', 'Files', 'Total Connections'],
  pkgGroups.sort(g => -g.rows.length, 'desc').map(g => [
    g.key, g.rows.length,
    g.rows.values.reduce((sum, p) => sum + (p.incoming||0) + (p.outgoing||0), 0)
  ])
);
```
