---
type: dashboard
title: "Change Timeline & Activity"
tags: [dashboard, timeline]
---

# 📅 Architecture Activity Overview

> Tracks the most connected / most changed areas of the codebase.

## Top Activity Hotspots

- 📅 [[@hamafx-shared]] — **956.3** connections · `@hamafx/shared`
- 📅 [[@hamafx-web]] — **906.6** connections · `@hamafx/web`
- 📅 [[@hamafx-ai]] — **523.1** connections · `@hamafx/ai`
- 📅 [[vitest-installServerOnlyStub]] — **450** connections · `@hamafx/test-utils`
- 📅 [[@hamafx-db]] — **423.2** connections · `@hamafx/db`
- 📅 [[@hamafx-data]] — **168.4** connections · `@hamafx/data`
- 📅 [[scripts]] — **115.6** connections · `scripts`
- 📅 [[registry-ToolPartState]] — **104** connections · `@hamafx/web`
- 📅 [[@hamafx-worker]] — **103.1** connections · `@hamafx/worker`
- 📅 [[@hamafx-indicators]] — **95.2** connections · `@hamafx/indicators`
- 📅 [[db-getDb]] — **81.8** connections · `@hamafx/ai`
- 📅 [[registry-ToolPlugin]] — **73.1** connections · `@hamafx/ai`
- 📅 [[client-DbClient]] — **72.5** connections · `@hamafx/db`
- 📅 [[log-Logger]] — **70.9** connections · `@hamafx/worker`
- 📅 [[types-AnalysisMode]] — **70.7** connections · `@hamafx/ai`
- 📅 [[tool-context-ToolEnv]] — **69.1** connections · `@hamafx/ai`
- 📅 [[types-BotPlatform]] — **63.8** connections · `@hamafx/ai`
- 📅 [[symbols-SYMBOLS]] — **62.8** connections · `@hamafx/shared`
- 📅 [[model-resolveModel]] — **60.5** connections · `@hamafx/ai`
- 📅 [[auth-users]] — **60.5** connections · `@hamafx/db`

## DataviewJS — Files by Connection Count
```dataviewjs
const pages = dv.pages().where(p => p.type && p.type !== 'dashboard' && p.type !== 'index');
const byConnections = pages.sort(p => -(p.incoming + p.outgoing), 'desc').slice(0, 30);
dv.table(
  ['File', 'Type', 'Package', 'Incoming', 'Outgoing', 'Risk'],
  byConnections.map(p => [
    p.file.link, p.type, p.package || '', p.incoming, p.outgoing,
    p.risk ? p.risk.toUpperCase() : ''
  ])
);
```

## DataviewJS — Most Depended-On Files (ranked by incoming deps)
```dataviewjs
const deps = dv.pages().where(p => p.incoming && p.type !== 'dashboard' && p.type !== 'index');
dv.list(
  deps.sort(p => -p.incoming, 'desc').slice(0, 15)
    .map(p => p.file.link + ' — **' + p.incoming + '** incoming dependencies (package: ' + (p.package || 'root') + ')')
);
```
