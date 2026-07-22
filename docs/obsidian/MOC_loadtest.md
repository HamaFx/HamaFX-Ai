---
type: moc
package: "loadtest"
nodes: 31
totalIncoming: 144
totalOutgoing: 143
tags: [moc, loadtest]
---

# 📦 loadtest

> **Map of Content** · 31 files · 144 incoming + 143 outgoing = 287 connections

## DataviewJS — All Files in This Package
```dataviewjs
const pages = dv.pages().where(p => p.package === "loadtest" && p.type);
dv.table(
  ['File', 'Type', 'Incoming', 'Outgoing', 'Risk'],
  pages.sort(p => -(p.incoming + p.outgoing), 'desc').map(p => [
    p.file.link, p.type, p.incoming, p.outgoing,
    p.risk ? p.risk.toUpperCase() : ''
  ])
);
```

## Files by Type

### 📁 Module (30)
- [[smoke-config-mix-default]] *(0↖ 8↗)*
- [[smoke-write-mix-default]] *(0↖ 8↗)*
- [[load-config-mix-default]] *(0↖ 7↗)*
- [[load-market-read-default]] *(0↖ 7↗)*
- [[load-read-mix-default]] *(0↖ 7↗)*
- [[load-write-mix-default]] *(0↖ 7↗)*
- [[smoke-market-read-default]] *(0↖ 7↗)*
- [[smoke-read-mix-default]] *(0↖ 7↗)*
- [[soak-read-mix-default]] *(0↖ 7↗)*
- [[soak-write-mix-default]] *(0↖ 7↗)*
- [[spike-read-mix-default]] *(0↖ 7↗)*
- [[stress-market-read-default]] *(0↖ 7↗)*
- [[stress-write-mix-default]] *(0↖ 7↗)*
- [[chat-chatTurn]] *(1↖ 6↗)*
- [[load-chat-default]] *(0↖ 6↗)*
- [[spike-write-mix-default]] *(0↖ 6↗)*
- [[auth-default]] *(15↖ 4↗)*
- [[config-mix-configMix]] *(2↖ 4↗)*
- [[market-read-marketRead]] *(3↖ 4↗)*
- [[read-mix-readMix]] *(4↖ 4↗)*
- [[write-mix-writeMix]] *(5↖ 4↗)*
- [[http-HttpHeaders]] *(6↖ 3↗)*
- [[checks-expectOk]] *(6↖ 2↗)*
- [[environments-SessionCtx]] *(26↖ 1↗)*
- [[load-profiles-LoadProfileOptions]] *(14↖ 1↗)*
- [[thresholds-ThresholdPreset]] *(15↖ 1↗)*
- [[metrics-rateLimited]] *(2↖ 1↗)*
- [[seed-users]] *(0↖ 1↗)*
- [[summary-handleSummary]] *(15↖ 1↗)*
- [[k6-remote.d-randomItem]] *(0↖ 1↗)*

### 📦 Package (1)
- [[loadtest]] *(30↖ 0↗)*

