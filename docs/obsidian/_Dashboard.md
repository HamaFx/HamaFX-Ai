---
type: dashboard
title: "HamaFX-Ai Architecture Dashboard"
tags: [dashboard]
---

# 🏗️ HamaFX-Ai Architecture Dashboard

> Auto-generated from the codebase. Open the **Graph View** (Ctrl+G) to see all connections.

## 📊 Summary

| Metric | Value |
|--------|-------|
| Total Nodes | 1401 |
| Total Edges | 4220 |
| Packages | 16 |
| API Routes | 184 |
| Database Tables | 49 |
| AI Tools | 32 |
| Circular Deps | 6 |
| Hotspots | 50 |
| Dead/Orphan Files | 1098 |

## 🔍 Dataview Queries

```dataview
TABLE type, package, incoming, outgoing
FROM ""
SORT outgoing DESC
LIMIT 20
```

## ⚠️ Hotspots

```dataview
TABLE incoming, outgoing, risk
FROM ""
WHERE risk = "high" OR risk = "medium"
SORT incoming DESC
```

## 📂 Quick Links

- [[_API Routes]] — All 184 API endpoints
- [[_Database Tables]] — All 49 database tables
- [[_AI Tools]] — All 32 AI tools
- [[_Hotspots]] — Top 50 architecture hotspots
- [[_Circular Dependencies]] — 6 circular dependency chains
