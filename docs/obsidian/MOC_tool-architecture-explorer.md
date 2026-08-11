---
type: moc
package: "tool:architecture-explorer"
nodes: 18
totalIncoming: 65
totalOutgoing: 65
tags: [moc, tool:architecture-explorer]
---

# 📦 tool:architecture-explorer

> **Map of Content** · 18 files · 65 incoming + 65 outgoing = 130 connections

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

### 📁 Module (17)
- [[index_tool-architecture-explorer|index]] *(0↖ 11↗)*
- [[json-generator-generateArchitectureJson]] *(1↖ 8↗)*
- [[analyzer-Analyzer]] *(1↖ 7↗)*
- [[html-generator-generateHtml]] *(1↖ 6↗)*
- [[extractor-extractFile]] *(1↖ 5↗)*
- [[analysis-analyzeArchitecture]] *(1↖ 4↗)*
- [[knowledge-generator-KnowledgeOutput]] *(1↖ 4↗)*
- [[advanced-features-analyzeImpact]] *(1↖ 3↗)*
- [[git-history-scanGitHistory]] *(1↖ 3↗)*
- [[graph-model-GraphModel]] *(5↖ 3↗)*
- [[obsidian-generator-generateObsidianVault]] *(1↖ 3↗)*
- [[scanner-ScannedFile]] *(5↖ 3↗)*
- [[html-template-getHtmlTemplate]] *(1↖ 1↗)*
- [[scripts-getScripts]] *(1↖ 1↗)*
- [[styles-getStyles]] *(1↖ 1↗)*
- [[types-NodeType]] *(26↖ 1↗)*
- [[extractor.test-TOOL_NAMES]] *(0↖ 1↗)*

### 📦 Package (1)
- [[tool-architecture-explorer]] *(17↖ 0↗)*

