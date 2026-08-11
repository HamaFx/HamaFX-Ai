---
type: moc
package: "scripts"
nodes: 25
totalIncoming: 65
totalOutgoing: 65
tags: [moc, scripts]
---

# 📦 scripts

> **Map of Content** · 25 files · 65 incoming + 65 outgoing = 130 connections

## DataviewJS — All Files in This Package
```dataviewjs
const pages = dv.pages().where(p => p.package === "scripts" && p.type);
dv.table(
  ['File', 'Type', 'Incoming', 'Outgoing', 'Risk'],
  pages.sort(p => -(p.incoming + p.outgoing), 'desc').map(p => [
    p.file.link, p.type, p.incoming, p.outgoing,
    p.risk ? p.risk.toUpperCase() : ''
  ])
);
```

## Files by Type

### 📁 Module (24)
- [[index-STEPS]] *(0↖ 11↗)*
- [[config-title]] *(0↖ 6↗)*
- [[install-title]] *(0↖ 5↗)*
- [[launch-title]] *(0↖ 5↗)*
- [[market-data-title]] *(0↖ 5↗)*
- [[mode-title]] *(0↖ 4↗)*
- [[generate-env]] *(0↖ 3↗)*
- [[run-runCommand]] *(0↖ 3↗)*
- [[detect-existing-title]] *(0↖ 3↗)*
- [[prereqs-title]] *(0↖ 3↗)*
- [[prompts-CancelError]] *(0↖ 2↗)*
- [[secrets-loadSecretTemplate]] *(0↖ 2↗)*
- [[setup]] *(0↖ 2↗)*
- [[add-license]] *(0↖ 1↗)*
- [[check-console-errors]] *(0↖ 1↗)*
- [[check-test-files]] *(0↖ 1↗)*
- [[dev]] *(0↖ 1↗)*
- [[predeploy-migrate]] *(0↖ 1↗)*
- [[rewrite-dist-imports]] *(0↖ 1↗)*
- [[env-parseEnv]] *(0↖ 1↗)*
- [[io-createIO]] *(0↖ 1↗)*
- [[market-data-MARKET_DATA_PROVIDERS]] *(0↖ 1↗)*
- [[prereqs-MIN_NODE_MAJOR]] *(0↖ 1↗)*
- [[ui-setColorEnabled]] *(0↖ 1↗)*

### 📦 Package (1)
- [[scripts]] *(65↖ 0↗)*

