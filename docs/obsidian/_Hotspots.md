---
type: dashboard
title: "Architecture Hotspots"
count: 30
tags: [dashboard, analysis, risk/high]
---

# 🔥 Architecture Hotspots (30)

Files with the highest connectivity — changes here may cascade across the system.

> **Tip:** Use the **Local Graph** (right-click any file → "Open local graph")
> to see exactly what connects to these hotspots.

## Top 30 Hotspots

- 🔥 [[@hamafx-shared]] — score: **991** *(in: 642, out: 0)*
- 🔥 [[@hamafx-web]] — score: **862.9** *(in: 557, out: 0)*
- 🔥 [[@hamafx-ai]] — score: **582.1** *(in: 371, out: 0)*
- 🔥 [[@hamafx-db]] — score: **486.8** *(in: 308, out: 0)*
- 🔥 [[vitest-installServerOnlyStub]] — score: **415.1** *(in: 260, out: 2)*
- 🔥 [[@hamafx-data]] — score: **179.2** *(in: 106, out: 0)*
- 🔥 [[registry-ToolPartState]] — score: **104** *(in: 45, out: 35)*
- 🔥 [[@hamafx-worker]] — score: **103.1** *(in: 57, out: 0)*
- 🔥 [[@hamafx-indicators]] — score: **95.2** *(in: 52, out: 0)*
- 🔥 [[db-getDb]] — score: **81.8** *(in: 41, out: 7)*
- 🔥 [[registry-ToolPlugin]] — score: **73.1** *(in: 37, out: 3)*
- 🔥 [[client-DbClient]] — score: **72.5** *(in: 37, out: 2)*
- 🔥 [[log-Logger]] — score: **70.9** *(in: 36, out: 2)*
- 🔥 [[types-AnalysisMode]] — score: **70.7** *(in: 34, out: 7)*
- 🔥 [[tool-context-ToolEnv]] — score: **69.1** *(in: 33, out: 7)*
- 🔥 [[types-BotPlatform]] — score: **63.8** *(in: 32, out: 1)*
- 🔥 [[symbols-SYMBOLS]] — score: **62.8** *(in: 31, out: 2)*
- 🔥 [[model]] — score: **60.5** *(in: 30, out: 1)*
- 🔥 [[auth-users]] — score: **60.5** *(in: 30, out: 1)*
- 🔥 [[loadtest]] — score: **59.9** *(in: 30, out: 0)*
- 🔥 [[environments-SessionCtx]] — score: **53.9** *(in: 26, out: 1)*
- 🔥 [[types-NodeType]] — score: **53.9** *(in: 26, out: 1)*
- 🔥 [[tool-io-UiTextPart]] — score: **53.3** *(in: 1, out: 67)*
- 🔥 [[types-JobCoreContext]] — score: **51.2** *(in: 22, out: 7)*
- 🔥 [[errors-DataErrorCode]] — score: **47.9** *(in: 22, out: 2)*
- 🔥 [[cost-DEFAULT_TURN_ESTIMATE_USD]] — score: **42.9** *(in: 17, out: 7)*
- 🔥 [[consumer-NormalizedTick]] — score: **41.6** *(in: 17, out: 5)*
- 🔥 [[@hamafx-test-utils]] — score: **39.7** *(in: 18, out: 0)*
- 🔥 [[agent-runChat]] — score: **38.9** *(in: 4, out: 34)*
- 🔥 [[actions]] — score: **38.7** *(in: 17, out: 1)*

## DataviewJS — Live View
```dataviewjs
const pages = dv.pages().where(p => p.risk === 'high' && p.type !== 'dashboard');
dv.table(
  ['Node', 'Package', 'In', 'Out', 'Total'],
  pages.sort(p => -(p.incoming + p.outgoing), 'desc').map(p => [
    p.file.link, p.package || '', p.incoming, p.outgoing, p.incoming + p.outgoing
  ])
);
```
