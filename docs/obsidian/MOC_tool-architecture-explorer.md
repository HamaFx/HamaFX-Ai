---
type: moc
package: "tool:architecture-explorer"
nodes: 17
totalIncoming: 66
totalOutgoing: 66
tags: [moc, tool:architecture-explorer]
---

# 📦 tool:architecture-explorer

> **Map of Content** · 17 files · 66 incoming + 66 outgoing = 132 connections

## DataviewJS — All Files in This Package
```dataviewjs
const pages = dv.pages().where(p => p.package === "tool:architecture-explorer" && p.type);
dv.table(
  ['File', 'Type', 'Incoming', 'Outgoing', 'Risk'],
  pages.sort(p => -(p.incoming + p.outgoing), 'desc').map(p => [
    p.file.link, p.type, p.incoming, p.outgoing,
    p.risk ? p.risk.toUpperCase() : ''
  ])
);
```

## Files by Type

### 📁 Module (16)
- [[index_tool-architecture-explorer|index]] *(0↖ 11↗)*
- [[analyzer-Analyzer]] *(1↖ 8↗)*
- [[json-generator-generateArchitectureJson]] *(1↖ 7↗)*
- [[html-generator-generateHtml]] *(1↖ 6↗)*
- [[knowledge-generator-KnowledgeOutput]] *(1↖ 6↗)*
- [[extractor-extractFile]] *(1↖ 5↗)*
- [[analysis-analyzeArchitecture]] *(1↖ 4↗)*
- [[advanced-features-analyzeImpact]] *(1↖ 3↗)*
- [[git-history-scanGitHistory]] *(1↖ 3↗)*
- [[graph-model-GraphModel]] *(5↖ 3↗)*
- [[obsidian-generator-generateObsidianVault]] *(1↖ 3↗)*
- [[scanner-ScannedFile]] *(7↖ 3↗)*
- [[html-template-getHtmlTemplate]] *(1↖ 1↗)*
- [[scripts-getScripts]] *(1↖ 1↗)*
- [[styles-getStyles]] *(1↖ 1↗)*
- [[types-NodeType]] *(26↖ 1↗)*

### 📦 Package (1)
- [[tool-architecture-explorer]] *(16↖ 0↗)*

