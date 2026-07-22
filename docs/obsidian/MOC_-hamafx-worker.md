---
type: moc
package: "@hamafx/worker"
nodes: 58
totalIncoming: 196
totalOutgoing: 274
tags: [moc, hamafx-worker]
---

# 📦 @hamafx/worker

> **Map of Content** · 58 files · 196 incoming + 274 outgoing = 470 connections

## DataviewJS — All Files in This Package
```dataviewjs
const pages = dv.pages().where(p => p.package === "@hamafx/worker" && p.type);
dv.table(
  ['File', 'Type', 'Incoming', 'Outgoing', 'Risk'],
  pages.sort(p => -(p.incoming + p.outgoing), 'desc').map(p => [
    p.file.link, p.type, p.incoming, p.outgoing,
    p.risk ? p.risk.toUpperCase() : ''
  ])
);
```

## Files by Type

### 📁 Module (57)
- [[index-onShutdown]] *(0↖ 18↗)*
- [[index-JOBS]] *(4↖ 13↗)*
- [[live-ticks-LiveTicksWriterArgs]] *(2↖ 10↗)*
- [[multi-agent-analysis-runMultiAgentAnalysis]] *(1↖ 9↗)*
- [[snapshots-runSnapshots]] *(2↖ 8↗)*
- [[candles-1m-FlushClosedCandleArgs]] *(2↖ 8↗)*
- [[cli]] *(0↖ 8↗)*
- [[cot-job.test]] *(0↖ 8↗)*
- [[fred-actuals.test]] *(0↖ 8↗)*
- [[scheduler-startScheduler]] *(1↖ 7↗)*
- [[live-ticks.test]] *(0↖ 7↗)*
- [[snapshots-job.test]] *(0↖ 7↗)*
- [[consumer-BinanceStreamConsumerOptions]] *(0↖ 6↗)*
- [[cot-runCoT]] *(2↖ 6↗)*
- [[resonance-sync-runResonanceSync]] *(1↖ 6↗)*
- [[embedded-startEmbeddedScheduler]] *(0↖ 6↗)*
- [[briefings.test]] *(0↖ 6↗)*
- [[candle-1m-flush.test]] *(0↖ 6↗)*
- [[embedding-backfill.test]] *(0↖ 6↗)*
- [[weekly-review.test]] *(0↖ 6↗)*
- [[candle-1m-ClosedCandle]] *(6↖ 5↗)*
- [[briefings-runBriefings]] *(2↖ 5↗)*
- [[fred-actuals-runFredActuals]] *(2↖ 5↗)*
- [[weekly-review-runWeeklyReview]] *(2↖ 5↗)*
- [[consumer-NormalizedTick]] *(17↖ 5↗)*
- [[tick-buffer-TickBuffer]] *(5↖ 5↗)*
- [[symbol-manager-SymbolChangeEvent]] *(2↖ 5↗)*
- [[candle-1m.test]] *(0↖ 5↗)*
- [[symbol-manager.test]] *(0↖ 5↗)*
- [[tick-buffer.test]] *(0↖ 5↗)*
- [[http-server-HealthServerDeps]] *(1↖ 4↗)*
- [[alerts-runAlerts]] *(1↖ 4↗)*
- [[embedding-backfill-runEmbeddingBackfill]] *(2↖ 4↗)*
- [[retention-runRetention]] *(1↖ 4↗)*
- [[signalr-consumer.test]] *(0↖ 4↗)*
- [[signalr-reconnect.test]] *(0↖ 4↗)*
- [[base-ws-consumer]] *(1↖ 3↗)*
- [[types-JobCoreContext]] *(22↖ 3↗)*
- [[sentry-initSentry]] *(2↖ 3↗)*
- [[cron-lock.test]] *(0↖ 3↗)*
- [[env.test]] *(0↖ 3↗)*
- [[healthchecks.test]] *(0↖ 3↗)*
- [[jobs-registry.test]] *(0↖ 3↗)*
- [[log.test]] *(0↖ 3↗)*
- [[eslint.config-config]] *(0↖ 2↗)*
- [[cron-lock-CronLock]] *(2↖ 2↗)*
- [[log-Logger]] *(36↖ 2↗)*
- [[scheduler.test]] *(0↖ 2↗)*
- [[build]] *(0↖ 1↗)*
- [[index_tool-architecture-explorer|index]] *(1↖ 1↗)*
- [[env-WorkerEnv]] *(5↖ 1↗)*
- [[healthchecks-PingStatus]] *(3↖ 1↗)*
- [[sd-notify-notifyWatchdog]] *(1↖ 1↗)*
- [[reconnect-DEFAULT_RECONNECT_DELAYS]] *(1↖ 1↗)*
- [[tenant-router-TenantRouter]] *(9↖ 1↗)*
- [[empty]] *(0↖ 1↗)*
- [[vitest.config-defineConfig]] *(0↖ 1↗)*

### 📦 Package (1)
- [[@hamafx-worker]] *(57↖ 0↗)*

