---
type: dashboard
title: "Package Overview"
tags: [dashboard, overview]
---

# 📦 Package Dependency Matrix

> Each package has a dedicated **Map of Content (MOC)** below.

| Package | Nodes | Incoming Deps | Outgoing Deps | Layers |
|---------|-------|--------------|--------------|--------|
| @hamafx/web | 669 | 1037 | 1544 | package, core, api, ui |
| @hamafx/ai | 273 | 973 | 1306 | package, core, ai |
| @hamafx/db | 157 | 435 | 252 | package, core, data |
| @hamafx/shared | 84 | 820 | 250 | package, core |
| @hamafx/data | 64 | 201 | 230 | package, core |
| @hamafx/worker | 58 | 200 | 278 | package, core |
| @hamafx/indicators | 39 | 102 | 159 | package, core |
| loadtest | 31 | 144 | 143 | package, core |
| @hamafx/test-utils | 19 | 278 | 36 | package, core |
| tool:architecture-explorer | 17 | 66 | 66 | package, core |
| scripts | 7 | 6 | 6 | package, core |
| @hamafx/config | 4 | 12 | 4 | package, core |
| root | 3 | 2 | 2 | package, core |
| tool:lighthouse | 2 | 1 | 1 | package, core |
| docs | 1 | 0 | 0 | package |
| infra | 1 | 0 | 0 | package |

## Package MOCs

- [[MOC_-hamafx-ai]]
- [[MOC_-hamafx-config]]
- [[MOC_-hamafx-data]]
- [[MOC_-hamafx-db]]
- [[MOC_-hamafx-indicators]]
- [[MOC_-hamafx-shared]]
- [[MOC_-hamafx-test-utils]]
- [[MOC_-hamafx-web]]
- [[MOC_-hamafx-worker]]
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
