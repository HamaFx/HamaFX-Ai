---
type: dashboard
title: "Hotspots"
count: 30
tags: [dashboard, analysis]
---

# 🔥 Architecture Hotspots

Files with the highest connectivity — changes here may cascade.

## Top Hotspots

- 🔥 [[@hamafx-shared]] — score: **1034.7** *(in: 671, out: 0)*
- 🔥 [[@hamafx-web]] — score: **853.8** *(in: 551, out: 0)*
- 🔥 [[@hamafx-ai]] — score: **582.1** *(in: 371, out: 0)*
- 🔥 [[@hamafx-db]] — score: **479.2** *(in: 303, out: 0)*
- 🔥 [[vitest-installServerOnlyStub]] — score: **392.4** *(in: 245, out: 2)*
- 🔥 [[@hamafx-data]] — score: **179.2** *(in: 106, out: 0)*
- 🔥 [[registry-ToolPartState]] — score: **104** *(in: 45, out: 35)*
- 🔥 [[@hamafx-worker]] — score: **103.1** *(in: 57, out: 0)*
- 🔥 [[@hamafx-indicators]] — score: **96.8** *(in: 53, out: 0)*
- 🔥 [[db-getDb]] — score: **81.8** *(in: 41, out: 7)*
- 🔥 [[registry-ToolPlugin]] — score: **73.1** *(in: 37, out: 3)*
- 🔥 [[log-Logger]] — score: **70.9** *(in: 36, out: 2)*
- 🔥 [[types-AnalysisMode]] — score: **70.7** *(in: 34, out: 7)*
- 🔥 [[client-DbClient]] — score: **69.2** *(in: 35, out: 2)*
- 🔥 [[tool-context-ToolEnv]] — score: **69.1** *(in: 33, out: 7)*
- 🔥 [[types-BotPlatform]] — score: **63.8** *(in: 32, out: 1)*
- 🔥 [[symbols-SYMBOLS]] — score: **62.8** *(in: 31, out: 2)*
- 🔥 [[model]] — score: **60.5** *(in: 30, out: 1)*
- 🔥 [[loadtest]] — score: **59.9** *(in: 30, out: 0)*
- 🔥 [[auth-users]] — score: **58.9** *(in: 29, out: 1)*

## Dataview

```dataview
TABLE incoming, outgoing, risk
WHERE risk = "high"
SORT incoming DESC
```
