---
type: dashboard
title: "HamaFX-Ai — Architecture Dashboard"
tags: [dashboard, hamafx]
cssclasses: [dashboard]
---

# 🏗️ HamaFX-Ai Architecture Dashboard

> **Auto-generated** from the codebase. Open **Graph View** (Ctrl+G) to see all connections.
> Tags are hierarchical: `#type/api_route`, `#hamafx/ai`, `#layer/data`, `#risk/high`.

## 📊 System Snapshot

| Metric | Value |
|--------|-------|
| Total Nodes | 1429 |
| Total Edges | 4277 |
| Packages | 16 |
| API Routes | 190 |
| Database Tables | 50 |
| AI Tools | 32 |
| Components | 112 |
| Circular Dependencies | 6 |
| Architecture Hotspots | 50 |
| Dead / Orphan Files | 1136 |

## 🔍 Live Queries

### Top 30 Most Connected Nodes
```dataviewjs
const pages = dv.pages().where(p => p.type && p.incoming != null && p.type !== 'dashboard' && p.type !== 'index');
const top = pages.sort(p => -(p.incoming + p.outgoing), 'desc').slice(0, 30);
dv.table(
  ['Node', 'Type', 'Package', 'In', 'Out', 'Risk'],
  top.map(p => [
    p.file.link, p.type, p.package || '', p.incoming, p.outgoing,
    '**' + (p.risk ? p.risk.toUpperCase() : '') + '**'
  ])
);
```

### Package Dependency Heatmap
```dataviewjs
const pages = dv.pages().where(p => p.type && p.type !== 'dashboard' && p.type !== 'index');
const pkgMap = new Map();
for (const p of pages) {
  const pkg = p.package || '(root)';
  if (!pkgMap.has(pkg)) pkgMap.set(pkg, { nodes: 0, totalIn: 0, totalOut: 0, layers: new Set() });
  const s = pkgMap.get(pkg);
  s.nodes++; s.totalIn += p.incoming || 0; s.totalOut += p.outgoing || 0;
  if (p.layer) s.layers.add(p.layer);
}
dv.table(
  ['Package', 'Nodes', 'Total In', 'Total Out', 'Layers'],
  [...pkgMap.entries()].sort((a,b) => b[1].nodes - a[1].nodes).map(([name, s]) => [
    name, s.nodes, s.totalIn, s.totalOut, [...s.layers].join(', ')
  ])
);
```

### Risk Distribution
```dataviewjs
const pages = dv.pages().where(p => p.risk && p.risk !== 'low' && p.type !== 'dashboard');
dv.table(
  ['Node', 'Type', 'Package', 'Risk', 'Connections'],
  pages.sort(p => -(p.incoming + p.outgoing), 'desc').map(p => [
    p.file.link, p.type, p.package || '',
    '**' + p.risk.toUpperCase() + '**',
    p.incoming + p.outgoing
  ])
);
```

## 📂 Quick Links

| Dashboard | What It Shows |
|-----------|--------------|
| [[_API Routes]] | 190 API endpoints |
| [[_Database Tables]] | 50 database tables |
| [[_AI Tools]] | 32 AI tools |
| [[_Agents]] | AI agents & committee |
| [[_Components]] | 112 React components |
| [[_Background Jobs]] | Worker jobs & timers |
| [[_Hotspots]] | Top 50 architecture hotspots |
| [[_Circular Dependencies]] | 6 circular dependency chains |
| [[_Timeline]] | Recent changes timeline |
| [[_Package Overview]] | Package-level dependency matrix |

> 🧭 **Tip:** Use **Ctrl+O** to open any file, **Ctrl+Shift+F** for full-text search,
> and the **Graph View** (Ctrl+G) with filters to explore the architecture visually.
