---
type: dashboard
title: "Change Timeline & Activity"
tags: [dashboard, timeline]
---

# 📅 Architecture Activity Overview

> Tracks the most connected / most changed areas of the codebase.

## Top Activity Hotspots

- 📅 [[@kestrel-shared]] — **956.3** connections · `@kestrel/shared`
- 📅 [[@kestrel-web]] — **908.1** connections · `@kestrel/web`
- 📅 [[@kestrel-ai]] — **523.1** connections · `@kestrel/ai`
- 📅 [[vitest-installServerOnlyStub]] — **451.5** connections · `@kestrel/test-utils`
- 📅 [[@kestrel-db]] — **423.2** connections · `@kestrel/db`
- 📅 [[@kestrel-data]] — **168.4** connections · `@kestrel/data`
- 📅 [[scripts]] — **115.6** connections · `scripts`
- 📅 [[registry-ToolPartState]] — **104** connections · `@kestrel/web`
- 📅 [[@kestrel-worker]] — **103.1** connections · `@kestrel/worker`
- 📅 [[@kestrel-indicators]] — **95.2** connections · `@kestrel/indicators`
- 📅 [[db-getDb]] — **81.8** connections · `@kestrel/ai`
- 📅 [[registry-ToolPlugin]] — **73.1** connections · `@kestrel/ai`
- 📅 [[client-DbClient]] — **72.5** connections · `@kestrel/db`
- 📅 [[log-Logger]] — **70.9** connections · `@kestrel/worker`
- 📅 [[types-AnalysisMode]] — **70.7** connections · `@kestrel/ai`
- 📅 [[tool-context-ToolEnv]] — **69.1** connections · `@kestrel/ai`
- 📅 [[types-BotPlatform]] — **63.8** connections · `@kestrel/ai`
- 📅 [[symbols-SYMBOLS]] — **62.8** connections · `@kestrel/shared`
- 📅 [[model-resolveModel]] — **60.5** connections · `@kestrel/ai`
- 📅 [[auth-users]] — **60.5** connections · `@kestrel/db`

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
