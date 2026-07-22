---
type: dashboard
title: "Change Timeline & Activity"
tags: [dashboard, timeline]
---

# 📅 Architecture Activity Overview

> Tracks the most connected / most changed areas of the codebase.

## Top Activity Hotspots

- 📅 [[@hamafx-shared]] — **1034.7** connections · `@hamafx/shared`
- 📅 [[@hamafx-web]] — **853.8** connections · `@hamafx/web`
- 📅 [[@hamafx-ai]] — **582.1** connections · `@hamafx/ai`
- 📅 [[@hamafx-db]] — **479.2** connections · `@hamafx/db`
- 📅 [[vitest-installServerOnlyStub]] — **392.4** connections · `@hamafx/test-utils`
- 📅 [[@hamafx-data]] — **179.2** connections · `@hamafx/data`
- 📅 [[registry-ToolPartState]] — **104** connections · `@hamafx/web`
- 📅 [[@hamafx-worker]] — **103.1** connections · `@hamafx/worker`
- 📅 [[@hamafx-indicators]] — **96.8** connections · `@hamafx/indicators`
- 📅 [[db-getDb]] — **81.8** connections · `@hamafx/ai`
- 📅 [[registry-ToolPlugin]] — **73.1** connections · `@hamafx/ai`
- 📅 [[log-Logger]] — **70.9** connections · `@hamafx/worker`
- 📅 [[types-AnalysisMode]] — **70.7** connections · `@hamafx/ai`
- 📅 [[client-DbClient]] — **69.2** connections · `@hamafx/db`
- 📅 [[tool-context-ToolEnv]] — **69.1** connections · `@hamafx/ai`
- 📅 [[types-BotPlatform]] — **63.8** connections · `@hamafx/ai`
- 📅 [[symbols-SYMBOLS]] — **62.8** connections · `@hamafx/shared`
- 📅 [[model]] — **60.5** connections · `@hamafx/ai`
- 📅 [[loadtest]] — **59.9** connections · `loadtest`
- 📅 [[auth-users]] — **58.9** connections · `@hamafx/db`

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
