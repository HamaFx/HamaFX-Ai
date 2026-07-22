---
type: moc
package: "@hamafx/indicators"
nodes: 39
totalIncoming: 102
totalOutgoing: 160
tags: [moc, hamafx-indicators]
---

# 📦 @hamafx/indicators

> **Map of Content** · 39 files · 102 incoming + 160 outgoing = 262 connections

## DataviewJS — All Files in This Package
```dataviewjs
const pages = dv.pages().where(p => p.package === "@hamafx/indicators" && p.type);
dv.table(
  ['File', 'Type', 'Incoming', 'Outgoing', 'Risk'],
  pages.sort(p => -(p.incoming + p.outgoing), 'desc').map(p => [
    p.file.link, p.type, p.incoming, p.outgoing,
    p.risk ? p.risk.toUpperCase() : ''
  ])
);
```

## Files by Type

### 📁 Module (38)
- [[indicator-registry-IndicatorPlugin]] *(2↖ 11↗)*
- [[property.test]] *(0↖ 11↗)*
- [[index-ComputeStructureArgs]] *(0↖ 9↗)*
- [[smc-liquidity.test]] *(0↖ 6↗)*
- [[smc-structure.test]] *(0↖ 6↗)*
- [[asian-range.test]] *(0↖ 5↗)*
- [[pdh-pdl.test]] *(0↖ 5↗)*
- [[registry.test]] *(0↖ 5↗)*
- [[smc-fvg.test]] *(0↖ 5↗)*
- [[smc-order-blocks.test]] *(0↖ 5↗)*
- [[smc-swings.test]] *(0↖ 5↗)*
- [[atr-atr]] *(3↖ 4↗)*
- [[bollinger-BollingerPoint]] *(3↖ 4↗)*
- [[macd-MacdPoint]] *(3↖ 4↗)*
- [[moving-averages-sma]] *(4↖ 4↗)*
- [[rsi-rsi]] *(3↖ 4↗)*
- [[atr.test]] *(0↖ 4↗)*
- [[bollinger.test]] *(0↖ 4↗)*
- [[macd.test]] *(0↖ 4↗)*
- [[moving-averages.test]] *(0↖ 4↗)*
- [[pivots.test]] *(0↖ 4↗)*
- [[rsi.test]] *(0↖ 4↗)*
- [[pivots-ClassicPivots]] *(3↖ 3↗)*
- [[registry-ComputeArgs]] *(1↖ 3↗)*
- [[asian-range-AsianRange]] *(1↖ 3↗)*
- [[defaults-defaultSwingLookback]] *(2↖ 3↗)*
- [[fvg-DetectFvgOptions]] *(2↖ 3↗)*
- [[liquidity-DetectLiquiditySweepsOptions]] *(2↖ 3↗)*
- [[order-blocks-DetectOrderBlocksOptions]] *(2↖ 3↗)*
- [[pdh-pdl-PdhPdl]] *(1↖ 3↗)*
- [[structure-DetectStructureOptions]] *(2↖ 3↗)*
- [[swings-FindSwingsOptions]] *(4↖ 3↗)*
- [[util-closes]] *(5↖ 3↗)*
- [[defaults.test]] *(0↖ 3↗)*
- [[fixtures-makeCandles]] *(6↖ 3↗)*
- [[eslint.config-config]] *(0↖ 2↗)*
- [[index_tool-architecture-explorer|index]] *(0↖ 1↗)*
- [[vitest.config-defineConfig]] *(0↖ 1↗)*

### 📦 Package (1)
- [[@hamafx-indicators]] *(53↖ 0↗)*

