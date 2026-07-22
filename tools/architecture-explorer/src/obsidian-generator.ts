// SPDX-License-Identifier: Apache-2.0

// Obsidian vault generator — produces a folder of Markdown files with YAML
// frontmatter and wiki-links that Obsidian can open as a vault. Point
// Obsidian at docs/obsidian/ to get an interactive graph of the entire
// project architecture, with DataviewJS-powered dashboards, CSS snippets,
// and pre-configured graph color groups.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { ArchitectureModel } from './types.js';

// ── Constants ──

const ICONS: Record<string, string> = {
  package: '📦', app: '🚀', module: '📁', api_route: '🔗', component: '🧩',
  tool: '🔧', agent: '🤖', table: '🗄️', provider: '🌐', job: '⏰',
  service: '⚙️', middleware: '🛡️', config: '⚙️', schema: '📐', flow: '🔄',
  file: '📄', test: '🧪', route: '🌍', hook: '🪝', lib: '📚',
};

const TYPES: Record<string, string> = {
  package: 'Package', app: 'Application', module: 'Module', api_route: 'API Route',
  component: 'Component', tool: 'AI Tool', agent: 'Agent', table: 'DB Table',
  provider: 'Provider', job: 'Job', service: 'Service', middleware: 'Middleware',
  config: 'Config', schema: 'Schema', flow: 'Flow', file: 'Source File',
  test: 'Test File', route: 'Route', hook: 'Hook', lib: 'Library',
};

const GRAPH_COLORS: Record<string, string> = {
  package: '#e06c75', app: '#c678dd', module: '#61afef', api_route: '#98c379',
  component: '#d19a66', tool: '#56b6c2', agent: '#c678dd', table: '#e5c07b',
  provider: '#e06c75', job: '#d19a66', service: '#61afef',
  middleware: '#98c379', config: '#abb2bf', schema: '#e5c07b', flow: '#56b6c2',
  file: '#abb2bf', test: '#98c379', route: '#61afef', hook: '#56b6c2', lib: '#abb2bf',
};

// ── Helpers ──

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*#\[\]]/g, '-').replace(/\s+/g, '-').slice(0, 120);
}

function uniqueNodeFilename(node: any): string {
  const base = sanitizeFilename(node.name);
  const commonNames = new Set(['index', 'route', 'page', 'layout', 'types', 'utils', 'config', 'schema', 'constants', 'helpers']);
  if (commonNames.has(base) && node.pkg) {
    const pkgShort = node.pkg.replace(/@hamafx\//, '').replace(/[^a-zA-Z0-9_-]/g, '-');
    return `${base}_${pkgShort}`;
  }
  return base;
}

/** Full relative path for a node file in the vault (e.g. "packages/ai/src/routing.md") */
function nodeFilePath(node: any): string {
  const dir = dirname(node.path || '');
  const filename = uniqueNodeFilename(node) + '.md';
  return dir ? `${dir}/${filename}` : filename;
}

function buildWikiLinkMap(nodes: any[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const node of nodes) {
    const filename = uniqueNodeFilename(node);
    map.set(node.name, filename);
    map.set(node.id, filename);
  }
  return map;
}

function wikiLink(name: string, wikiMap: Map<string, string>): string {
  const target = wikiMap.get(name) || sanitizeFilename(name);
  if (target === sanitizeFilename(name)) return `[[${target}]]`;
  return `[[${target}|${name}]]`;
}

function resolveNodeId(edge: { source: string | { id: string }; target: string | { id: string } }, field: 'source' | 'target'): string {
  const val = edge[field];
  return typeof val === 'string' ? val : (val as { id: string }).id;
}

function makeTag(pkg: string | null): string {
  if (!pkg || pkg === 'root') return 'root';
  return pkg.replace(/^@/, '').replace(/\//g, '-');
}

function makeLayer(node: any): string {
  if (node.type === 'package') return 'package';
  if (node.type === 'app') return 'application';
  if (node.type === 'api_route' || node.type === 'middleware' || node.type === 'route') return 'api';
  if (node.type === 'component' || node.type === 'hook') return 'ui';
  if (node.type === 'table' || node.type === 'schema') return 'data';
  if (node.type === 'tool' || node.type === 'agent' || node.type === 'flow') return 'ai';
  if (node.type === 'provider' || node.type === 'job') return 'infra';
  if (node.type === 'config') return 'config';
  if (node.type === 'test') return 'test';
  return 'core';
}



// ── Obsidian Config Generation ──

function generateObsidianConfig(outputDir: string, model: ArchitectureModel): void {
  const obsidianDir = resolve(outputDir, '.obsidian');
  mkdirSync(obsidianDir, { recursive: true });

  // graph.json — color groups by node type + layer
  const colorGroups: any[] = [];
  const seenTypes = new Set<string>();
  for (const node of model.nodes) {
    if (seenTypes.has(node.type)) continue;
    seenTypes.add(node.type);
    if (GRAPH_COLORS[node.type]) {
      colorGroups.push({
        query: `tag:#type/${node.type}`,
        color: { a: 1, rgb: hexToRgb(GRAPH_COLORS[node.type]!) },
      });
    }
  }
  const layerColors: Record<string, string> = {
    package: '#e06c75', application: '#c678dd', api: '#61afef',
    ui: '#d19a66', data: '#e5c07b', ai: '#56b6c2',
    infra: '#e06c75', config: '#abb2bf', test: '#98c379', core: '#abb2bf',
  };
  for (const [layer, col] of Object.entries(layerColors)) {
    colorGroups.push({ query: `tag:#layer/${layer}`, color: { a: 1, rgb: hexToRgb(col) } });
  }

  const graphJson = {
    collapseFilter: false, search: '', showTags: true, showAttachments: false,
    hideUnresolved: false, showOrphans: true, collapseColorGroups: false,
    colorGroups, collapseDiscrete: false, displayIsolatedGroups: true,
  };
  writeFileSync(resolve(obsidianDir, 'graph.json'), JSON.stringify(graphJson, null, 2), 'utf-8');

  const appJson = {
    showFrontmatter: true, showLineNumber: false, strictLineBreaks: false,
    rightToLeft: false, showInlineTitle: true, defaultViewMode: 'source',
    livePreview: true, showUnsupportedFiles: true, attachmentFolderPath: './',
    promptDelete: false, newFileLocation: 'current', alwaysUpdateLinks: true,
    userIgnoreFilters: ['.obsidian/'],
  };
  writeFileSync(resolve(obsidianDir, 'app.json'), JSON.stringify(appJson, null, 2), 'utf-8');

  const appearanceJson = {
    cssTheme: 'Minimal', theme: 'obsidian', baseFontSize: 15,
    accentColor: '#5294e2', enabledCssSnippets: ['developer'],
    showViewHeader: true, nativeMenus: false,
  };
  writeFileSync(resolve(obsidianDir, 'appearance.json'), JSON.stringify(appearanceJson, null, 2), 'utf-8');

  const corePluginsJson: Record<string, boolean> = {
    'file-explorer': true, 'global-search': true, 'switcher': true,
    'graph': true, 'backlink': true, 'outgoing-link': true,
    'tag-pane': true, 'properties': true, 'page-preview': false,
    'daily-notes': false, 'templates': false, 'note-composer': false,
    'command-palette': true, 'slash-command': false, 'editor-status': true,
    'bookmarks': false, 'markdown-importer': false, 'zk-prefixer': false,
    'random-note': false, 'outline': true, 'word-count': true, 'slides': false,
    'audio-recorder': false, 'workspaces': false, 'file-recovery': true,
    'publish': false, 'sync': false, 'canvas': true, 'webviewer': false,
  };
  writeFileSync(resolve(obsidianDir, 'core-plugins.json'), JSON.stringify(corePluginsJson, null, 2), 'utf-8');

  const snippetsDir = resolve(obsidianDir, 'snippets');
  mkdirSync(snippetsDir, { recursive: true });
  writeFileSync(resolve(snippetsDir, 'developer.css'), DEVELOPER_CSS, 'utf-8');
}

function hexToRgb(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

// ── Main Generator ──

export function generateObsidianVault(model: ArchitectureModel, outputDir: string): void {
  mkdirSync(outputDir, { recursive: true });

  // 1. Generate .obsidian/ config
  generateObsidianConfig(outputDir, model);

  const nodeMap = new Map(model.nodes.map((n) => [n.id, n]));
  const wikiMap = buildWikiLinkMap(model.nodes);

  // 2. Pre-compute connection counts (one pass over edges)
  const incCountMap = new Map<string, number>();
  const outCountMap = new Map<string, number>();
  for (const n of model.nodes) {
    incCountMap.set(n.id, 0);
    outCountMap.set(n.id, 0);
  }
  model.edges.forEach((e) => {
    const tgt = resolveNodeId(e, 'target');
    const src = resolveNodeId(e, 'source');
    incCountMap.set(tgt, (incCountMap.get(tgt) ?? 0) + 1);
    outCountMap.set(src, (outCountMap.get(src) ?? 0) + 1);
  });

  // 3. DASHBOARD FILES
  generateDashboard(outputDir, model, wikiMap);
  generateTypeIndices(outputDir, model, wikiMap, incCountMap, outCountMap);
  generateTimelineDashboard(outputDir, model, wikiMap);
  generatePackageOverview(outputDir, model, wikiMap);

  // 4. PACKAGE MOC FILES
  generatePackageMocs(outputDir, model, wikiMap, incCountMap, outCountMap);

  // 5. NODE FILES — mirror project folder structure
  let fileCount = 0;
  for (const node of model.nodes) {
    const dir = resolve(outputDir, dirname(node.path || ''));
    mkdirSync(dir, { recursive: true });
    const content = generateNodeMarkdown(node, model, nodeMap, wikiMap, incCountMap, outCountMap);
    writeFileSync(resolve(dir, uniqueNodeFilename(node) + '.md'), content, 'utf-8');
    fileCount++;
  }

  // 6. CANVAS
  generateArchitectureCanvas(outputDir, model);

  const dashCount = 4 + 6 + (model.analysis?.hotspots?.length ? 1 : 0) + (model.analysis?.cyclicDependencies?.length ? 1 : 0);
  console.log(`   Obsidian vault: ${fileCount} node files + ${dashCount} dashboards + .obsidian/ config + Canvas + CSS`);
}

// ── Dashboard Files ──

function generateDashboard(
  outputDir: string, model: ArchitectureModel, wikiMap: Map<string, string>,
): void {
  const a = model.analysis || {};
  const s = a.summary || {};
  const apiCount = model.nodes.filter((n) => n.type === 'api_route').length;
  const tableCount = model.nodes.filter((n) => n.type === 'table').length;
  const toolCount = model.nodes.filter((n) => n.type === 'tool').length;
  const compCount = model.nodes.filter((n) => n.type === 'component').length;
  const totalCycles = s.totalCycles ?? 0;

  // DataviewJS snippets — use D sigil to prevent TS template interpolation
  const TOP30_JS = `\`\`\`dataviewjs
const pages = dv.pages().where(p => p.type && p.incoming != null && p.type !== 'dashboard' && p.type !== 'index');
const top = pages.sort(p => -(p.incoming + p.outgoing), 'desc').slice(0, 30);
dv.table(
  ['Node', 'Type', 'Package', 'In', 'Out', 'Risk'],
  top.map(p => [
    p.file.link, p.type, p.package || '', p.incoming, p.outgoing,
    '**' + (p.risk ? p.risk.toUpperCase() : '') + '**'
  ])
);
\`\`\``;

  const HEATMAP_JS = `\`\`\`dataviewjs
const pages = dv.pages().where(p => p.type && p.type !== 'dashboard' && p.type !== 'index');
const pkgMap = new Map();
for (const p of pages) {
  const pkg = p.package || '(root)';
  if (!pkgMap.has(pkg)) pkgMap.set(pkg, { nodes: 0, totalIn: 0, totalOut: 0, layers: new Set() });
  const s = pkgMap.get(pkg);
  s.nodes++; s.totalIn += p.incoming || 0; s.totalOut += p.outgoing || 0;
  if (p.layer) s.layers.add(p.layer);
}
dv.table(
  ['Package', 'Nodes', 'Total In', 'Total Out', 'Layers'],
  [...pkgMap.entries()].sort((a,b) => b[1].nodes - a[1].nodes).map(([name, s]) => [
    name, s.nodes, s.totalIn, s.totalOut, [...s.layers].join(', ')
  ])
);
\`\`\``;

  const RISK_JS = `\`\`\`dataviewjs
const pages = dv.pages().where(p => p.risk && p.risk !== 'low' && p.type !== 'dashboard');
dv.table(
  ['Node', 'Type', 'Package', 'Risk', 'Connections'],
  pages.sort(p => -(p.incoming + p.outgoing), 'desc').map(p => [
    p.file.link, p.type, p.package || '',
    '**' + p.risk.toUpperCase() + '**',
    p.incoming + p.outgoing
  ])
);
\`\`\``;

  const md = `---
type: dashboard
title: "HamaFX-Ai — Architecture Dashboard"
tags: [dashboard, hamafx]
cssclasses: [dashboard]
---

# 🏗️ HamaFX-Ai Architecture Dashboard

> **Auto-generated** from the codebase. Open **Graph View** (Ctrl+G) to see all connections.
> Tags are hierarchical: \`#type/api_route\`, \`#hamafx/ai\`, \`#layer/data\`, \`#risk/high\`.

## 📊 System Snapshot

| Metric | Value |
|--------|-------|
| Total Nodes | ${model.nodes.length} |
| Total Edges | ${model.edges.length} |
| Packages | ${model.packages.length} |
| API Routes | ${apiCount} |
| Database Tables | ${tableCount} |
| AI Tools | ${toolCount} |
| Components | ${compCount} |
| Circular Dependencies | ${totalCycles} |
| Architecture Hotspots | ${s.hotspotCount ?? 0} |
| Dead / Orphan Files | ${s.deadOrOrphanCount ?? 0} |

## 🔍 Live Queries

### Top 30 Most Connected Nodes
${TOP30_JS}

### Package Dependency Heatmap
${HEATMAP_JS}

### Risk Distribution
${RISK_JS}

## 📂 Quick Links

| Dashboard | What It Shows |
|-----------|--------------|
| [[_API Routes]] | ${apiCount} API endpoints |
| [[_Database Tables]] | ${tableCount} database tables |
| [[_AI Tools]] | ${toolCount} AI tools |
| [[_Agents]] | AI agents & committee |
| [[_Components]] | ${compCount} React components |
| [[_Background Jobs]] | Worker jobs & timers |
| [[_Hotspots]] | Top ${s.hotspotCount ?? 0} architecture hotspots |
${totalCycles > 0 ? `| [[_Circular Dependencies]] | ${totalCycles} circular dependency chains |` : ''}
| [[_Timeline]] | Recent changes timeline |
| [[_Package Overview]] | Package-level dependency matrix |

> 🧭 **Tip:** Use **Ctrl+O** to open any file, **Ctrl+Shift+F** for full-text search,
> and the **Graph View** (Ctrl+G) with filters to explore the architecture visually.
`;
  writeFileSync(resolve(outputDir, '_Dashboard.md'), md, 'utf-8');
}

// ── Type Indices ──

function generateTypeIndices(
  outputDir: string, model: ArchitectureModel,
  wikiMap: Map<string, string>, incCountMap: Map<string, number>, outCountMap: Map<string, number>,
): void {
  const typeConfigs = [
    { type: 'api_route', title: '_API Routes', icon: '🔗' },
    { type: 'table', title: '_Database Tables', icon: '🗄️' },
    { type: 'tool', title: '_AI Tools', icon: '🔧' },
    { type: 'agent', title: '_Agents', icon: '🤖' },
    { type: 'component', title: '_Components', icon: '🧩' },
    { type: 'job', title: '_Background Jobs', icon: '⏰' },
  ];

  for (const tc of typeConfigs) {
    const nodes = model.nodes.filter((n) => n.type === tc.type);
    if (nodes.length === 0) continue;

    const list = nodes
      .sort((a, b) => (outCountMap.get(b.id) ?? 0) - (outCountMap.get(a.id) ?? 0))
      .map((n) => {
        const inc = incCountMap.get(n.id) ?? 0;
        const out = outCountMap.get(n.id) ?? 0;
        return `- ${wikiLink(n.name, wikiMap)} · \`${n.pkg || 'root'}\` · \`${n.path || ''}\`  *(↖${inc} ↗${out} = ${inc + out})*`;
      })
      .join('\n');

    const md = `---
type: index
category: "${tc.type}"
count: ${nodes.length}
tags: [index, type/${tc.type}]
---

# ${tc.icon} ${TYPES[tc.type] || tc.type}s (${nodes.length})

## DataviewJS — Sorted by Most Connected
\`\`\`dataviewjs
const pages = dv.pages().where(p => p.type === "${tc.type}");
dv.table(
  ['Name', 'Package', 'Path', 'Incoming', 'Outgoing', 'Risk'],
  pages.sort(p => -(p.incoming + p.outgoing), 'desc').map(p => [
    p.file.link, p.package || '', p.path || '', p.incoming, p.outgoing,
    p.risk ? p.risk.toUpperCase() : ''
  ])
);
\`\`\`

## Full List

${list}
`;
    writeFileSync(resolve(outputDir, `${tc.title}.md`), md, 'utf-8');
  }

  // --- Hotspots ---
  const hotspots = model.analysis?.hotspots ?? [];
  if (hotspots.length > 0) {
    const list = hotspots.slice(0, 30)
      .map((h) => `- 🔥 ${wikiLink(h.name, wikiMap)} — score: **${h.score}** *(in: ${h.incoming}, out: ${h.outgoing})*`)
      .join('\n');

    const md = `---
type: dashboard
title: "Architecture Hotspots"
count: ${hotspots.length}
tags: [dashboard, analysis, risk/high]
---

# 🔥 Architecture Hotspots (${hotspots.length})

Files with the highest connectivity — changes here may cascade across the system.

> **Tip:** Use the **Local Graph** (right-click any file → "Open local graph")
> to see exactly what connects to these hotspots.

## Top 30 Hotspots

${list}

## DataviewJS — Live View
\`\`\`dataviewjs
const pages = dv.pages().where(p => p.risk === 'high' && p.type !== 'dashboard');
dv.table(
  ['Node', 'Package', 'In', 'Out', 'Total'],
  pages.sort(p => -(p.incoming + p.outgoing), 'desc').map(p => [
    p.file.link, p.package || '', p.incoming, p.outgoing, p.incoming + p.outgoing
  ])
);
\`\`\`
`;
    writeFileSync(resolve(outputDir, '_Hotspots.md'), md, 'utf-8');
  }

  // --- Circular Dependencies ---
  const cycles = model.analysis?.cyclicDependencies ?? [];
  if (cycles.length > 0) {
    const list = cycles.map((c) => {
      const linked = c.nodes.map((n) => {
        const node = model.nodes.find((x) => x.id === n);
        return node ? wikiLink(node.name, wikiMap) : n;
      }).join(' → ');
      return `- 🔄 ${c.length} nodes: ${linked}`;
    }).join('\n');

    const md = `---
type: dashboard
title: "Circular Dependencies"
count: ${cycles.length}
tags: [dashboard, analysis, risk/high]
---

# 🔄 Circular Dependencies (${cycles.length})

> Circular dependencies create tight coupling — extract shared interfaces or
> introduce a facade layer to break them.

${list}
`;
    writeFileSync(resolve(outputDir, '_Circular Dependencies.md'), md, 'utf-8');
  }
}

// ── Timeline Dashboard ──

function generateTimelineDashboard(outputDir: string, model: ArchitectureModel, wikiMap: Map<string, string>): void {
  const hotspots = (model.analysis?.hotspots ?? []).slice(0, 20);
  const timelineItems = hotspots.map((h) => {
    const node = model.nodes.find((n) => n.id === h.nodeId);
    if (!node) return `- 📅 ${wikiLink(h.name, wikiMap)} — **${h.score}** connections`;
    return `- 📅 ${wikiLink(node.name, wikiMap)} — **${h.score}** connections · \`${node.pkg || 'root'}\``;
  }).join('\n');

  // Pre-built DataviewJS blocks
  const BY_CONNECTIONS_JS = `\`\`\`dataviewjs
const pages = dv.pages().where(p => p.type && p.type !== 'dashboard' && p.type !== 'index');
const byConnections = pages.sort(p => -(p.incoming + p.outgoing), 'desc').slice(0, 30);
dv.table(
  ['File', 'Type', 'Package', 'Incoming', 'Outgoing', 'Risk'],
  byConnections.map(p => [
    p.file.link, p.type, p.package || '', p.incoming, p.outgoing,
    p.risk ? p.risk.toUpperCase() : ''
  ])
);
\`\`\``;

  const DEPS_LIST_JS = `\`\`\`dataviewjs
const deps = dv.pages().where(p => p.incoming && p.type !== 'dashboard' && p.type !== 'index');
dv.list(
  deps.sort(p => -p.incoming, 'desc').slice(0, 15)
    .map(p => p.file.link + ' — **' + p.incoming + '** incoming dependencies (package: ' + (p.package || 'root') + ')')
);
\`\`\``;

  const md = `---
type: dashboard
title: "Change Timeline & Activity"
tags: [dashboard, timeline]
---

# 📅 Architecture Activity Overview

> Tracks the most connected / most changed areas of the codebase.

## Top Activity Hotspots

${timelineItems || '_No hotspots detected._'}

## DataviewJS — Files by Connection Count
${BY_CONNECTIONS_JS}

## DataviewJS — Most Depended-On Files (ranked by incoming deps)
${DEPS_LIST_JS}
`;
  writeFileSync(resolve(outputDir, '_Timeline.md'), md, 'utf-8');
}

// ── Package Overview ──

function generatePackageOverview(outputDir: string, model: ArchitectureModel, wikiMap: Map<string, string>): void {
  const pkgMap = new Map<string, { nodes: any[]; totalIn: number; totalOut: number; layers: Set<string> }>();
  for (const n of model.nodes) {
    const pkg = n.pkg || '(root)';
    if (!pkgMap.has(pkg)) pkgMap.set(pkg, { nodes: [], totalIn: 0, totalOut: 0, layers: new Set() });
    pkgMap.get(pkg)!.nodes.push(n);
  }
  for (const e of model.edges) {
    const srcNode = model.nodes.find((n) => n.id === resolveNodeId(e, 'source'));
    const tgtNode = model.nodes.find((n) => n.id === resolveNodeId(e, 'target'));
    const srcPkg = srcNode?.pkg || '(root)';
    const tgtPkg = tgtNode?.pkg || '(root)';
    if (pkgMap.has(srcPkg)) pkgMap.get(srcPkg)!.totalOut++;
    if (pkgMap.has(tgtPkg)) pkgMap.get(tgtPkg)!.totalIn++;
  }
  for (const n of model.nodes) {
    const pkg = n.pkg || '(root)';
    if (pkgMap.has(pkg)) pkgMap.get(pkg)!.layers.add(makeLayer(n));
  }

  const rows = [...pkgMap.entries()]
    .sort((a, b) => b[1].nodes.length - a[1].nodes.length)
    .map(([name, s]) => `| ${name} | ${s.nodes.length} | ${s.totalIn} | ${s.totalOut} | ${[...s.layers].join(', ')} |`)
    .join('\n');

  const mocLinks = [...pkgMap.keys()]
    .sort()
    .map((pkg) => `- [[MOC_${sanitizeFilename(pkg.replace(/[@/]/g, '-').replace(/^hamafx-/, ''))}]]`)
    .join('\n');

  const HEATMAP_JS = `\`\`\`dataviewjs
const pages = dv.pages().where(p => p.type && p.type !== 'dashboard' && p.type !== 'index');
const pkgGroups = pages.groupBy(p => p.package || '(root)');
dv.table(
  ['Package', 'Files', 'Total Connections'],
  pkgGroups.sort(g => -g.rows.length, 'desc').map(g => [
    g.key, g.rows.length,
    g.rows.values.reduce((sum, p) => sum + (p.incoming||0) + (p.outgoing||0), 0)
  ])
);
\`\`\``;

  const md = `---
type: dashboard
title: "Package Overview"
tags: [dashboard, overview]
---

# 📦 Package Dependency Matrix

> Each package has a dedicated **Map of Content (MOC)** below.

| Package | Nodes | Incoming Deps | Outgoing Deps | Layers |
|---------|-------|--------------|--------------|--------|
${rows}

## Package MOCs

${mocLinks}

## DataviewJS — Cross-Package Heatmap
${HEATMAP_JS}
`;
  writeFileSync(resolve(outputDir, '_Package Overview.md'), md, 'utf-8');
}

// ── Package MOC Files ──

function generatePackageMocs(
  outputDir: string, model: ArchitectureModel, wikiMap: Map<string, string>,
  incCountMap: Map<string, number>, outCountMap: Map<string, number>,
): void {
  const pkgMap = new Map<string, any[]>();
  for (const n of model.nodes) {
    const pkg = n.pkg || '(root)';
    if (!pkgMap.has(pkg)) pkgMap.set(pkg, []);
    pkgMap.get(pkg)!.push(n);
  }

  for (const [pkg, nodes] of pkgMap) {
    const pkgTag = makeTag(pkg);
    const mocName = sanitizeFilename(pkg.replace(/[@/]/g, '-').replace(/^hamafx-/, ''));
    const totalInc = nodes.reduce((sum, n) => sum + (incCountMap.get(n.id) ?? 0), 0);
    const totalOut = nodes.reduce((sum, n) => sum + (outCountMap.get(n.id) ?? 0), 0);

    const typeGroups = new Map<string, any[]>();
    for (const n of nodes) {
      const t = n.type || 'file';
      if (!typeGroups.has(t)) typeGroups.set(t, []);
      typeGroups.get(t)!.push(n);
    }

    let typedSections = '';
    for (const [type, typeNodes] of [...typeGroups.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const icon = ICONS[type] || '📄';
      typedSections += `\n### ${icon} ${TYPES[type] || type} (${typeNodes.length})\n`;
      for (const n of typeNodes.sort((a, b) => (outCountMap.get(b.id) ?? 0) - (outCountMap.get(a.id) ?? 0))) {
        typedSections += `- ${wikiLink(n.name, wikiMap)} *(${incCountMap.get(n.id) ?? 0}↖ ${outCountMap.get(n.id) ?? 0}↗)*\n`;
      }
    }

    // Use JSON.stringify for safe JS string embedding
    const pkgJson = JSON.stringify(pkg);

    const md = `---
type: moc
package: ${pkgJson}
nodes: ${nodes.length}
totalIncoming: ${totalInc}
totalOutgoing: ${totalOut}
tags: [moc, ${pkgTag}]
---

# 📦 ${pkg}

> **Map of Content** · ${nodes.length} files · ${totalInc} incoming + ${totalOut} outgoing = ${totalInc + totalOut} connections

## DataviewJS — All Files in This Package
\`\`\`dataviewjs
const pages = dv.pages().where(p => p.package === ${pkgJson} && p.type);
dv.table(
  ['File', 'Type', 'Incoming', 'Outgoing', 'Risk'],
  pages.sort(p => -(p.incoming + p.outgoing), 'desc').map(p => [
    p.file.link, p.type, p.incoming, p.outgoing,
    p.risk ? p.risk.toUpperCase() : ''
  ])
);
\`\`\`

## Files by Type
${typedSections}
`;
    writeFileSync(resolve(outputDir, `MOC_${mocName}.md`), md, 'utf-8');
  }
}

// ── Architecture Canvas ──

function generateArchitectureCanvas(outputDir: string, model: ArchitectureModel): void {
  const pkgNodes = model.nodes.filter((n) => n.type === 'package' || n.type === 'app');

  const canvasNodes: any[] = [];
  const canvasEdges: any[] = [];
  const cols = 4;
  const spacing = 450;

  pkgNodes.forEach((n, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    canvasNodes.push({
      id: n.id,
      type: 'file',
      file: nodeFilePath(n),  // Full relative path from vault root
      x: col * spacing + 50,
      y: row * spacing + 50,
      width: 320,
      height: 180,
    });
  });

  // Inter-package edges
  const addedEdges = new Set<string>();
  model.edges.forEach((e) => {
    const src = resolveNodeId(e, 'source');
    const tgt = resolveNodeId(e, 'target');
    if (src === tgt) return;
    const srcNode = model.nodes.find((n) => n.id === src);
    const tgtNode = model.nodes.find((n) => n.id === tgt);
    const srcPkg = srcNode?.pkg || '(root)';
    const tgtPkg = tgtNode?.pkg || '(root)';
    if (srcPkg === tgtPkg) return;

    const edgeKey = `${srcPkg}\u2192${tgtPkg}`;
    if (addedEdges.has(edgeKey)) return;
    addedEdges.add(edgeKey);

    const srcPkgNode = pkgNodes.find((n) => n.name === srcPkg || n.pkg === srcPkg);
    const tgtPkgNode = pkgNodes.find((n) => n.name === tgtPkg || n.pkg === tgtPkg);
    if (!srcPkgNode || !tgtPkgNode) return;

    const count = model.edges.filter((e2) => {
      const s2 = resolveNodeId(e2, 'source');
      const t2 = resolveNodeId(e2, 'target');
      const sn2 = model.nodes.find((n) => n.id === s2);
      const tn2 = model.nodes.find((n) => n.id === t2);
      return (sn2?.pkg || '(root)') === srcPkg && (tn2?.pkg || '(root)') === tgtPkg;
    }).length;

    canvasEdges.push({
      id: edgeKey,
      fromNode: srcPkgNode.id,
      toNode: tgtPkgNode.id,
      fromSide: 'right',
      toSide: 'left',
      label: `${count} deps`,
      color: count > 20 ? '5' : count > 10 ? '3' : '1',
    });
  });

  writeFileSync(resolve(outputDir, '_Architecture.canvas'), JSON.stringify({ nodes: canvasNodes, edges: canvasEdges }, null, 2), 'utf-8');
}

// ── Individual Node Markdown ──

function generateNodeMarkdown(
  node: any, model: ArchitectureModel,
  nodeMap: Map<string, any>, wikiMap: Map<string, string>,
  incCountMap: Map<string, number>, outCountMap: Map<string, number>,
): string {
  const inc = incCountMap.get(node.id) ?? 0;
  const out = outCountMap.get(node.id) ?? 0;
  const total = inc + out;
  const risk = total > 30 ? 'high' : total > 15 ? 'medium' : 'low';
  const icon = ICONS[node.type] || '📄';
  const typeLabel = TYPES[node.type] || node.type;
  const layer = makeLayer(node);
  const pkgTag = makeTag(node.pkg);

  const incoming = new Set<string>();
  const outgoing = new Set<string>();
  model.edges.forEach((e) => {
    const src = resolveNodeId(e, 'source');
    const tgt = resolveNodeId(e, 'target');
    if (tgt === node.id) {
      const n = nodeMap.get(src);
      if (n && n.name !== node.name) incoming.add(n.name);
    }
    if (src === node.id) {
      const n = nodeMap.get(tgt);
      if (n && n.name !== node.name) outgoing.add(n.name);
    }
  });

  const outgoingLinks = [...outgoing].slice(0, 20).map((name) => wikiLink(name, wikiMap)).join(' · ');
  const incomingLinks = [...incoming].slice(0, 20).map((name) => wikiLink(name, wikiMap)).join(' · ');
  const moreOut = outgoing.size > 20 ? `\n> ... and ${outgoing.size - 20} more` : '';
  const moreInc = incoming.size > 20 ? `\n> ... and ${incoming.size - 20} more` : '';

  return `---
type: ${node.type}
package: "${node.pkg || '(root)'}"
path: "${node.path || ''}"
incoming: ${inc}
outgoing: ${out}
connections: ${total}
risk: ${risk}
layer: ${layer}
tags: [type/${node.type}, ${pkgTag}, layer/${layer}${risk !== 'low' ? `, risk/${risk}` : ''}]
aliases: [${node.name}]
---

# ${icon} ${node.name}

> **${typeLabel}** · \`${node.pkg || 'root'}\` · \`${node.path || ''}\`

${node.description ? `\n${node.description}\n` : ''}

## 📊 Connections

| | Count |
|---|---|
| Incoming dependencies | ${inc} |
| Outgoing dependencies | ${out} |
| Total connections | ${total} |
| Risk level | **${risk.toUpperCase()}** |
| Layer | \`${layer}\` |
| Package tag | \`#${pkgTag}\` |

${outgoingLinks ? `\n### 📤 Depends On (${outgoing.size})\n${outgoingLinks}${moreOut}\n` : ''}
${incomingLinks ? `\n### 📥 Depended On By (${incoming.size})\n${incomingLinks}${moreInc}\n` : ''}

${node.metadata?.exports?.length ? `\n## 📦 Exports\n${(node.metadata.exports as string[]).slice(0, 15).map((e) => `- \`${e}\``).join('\n')}\n` : ''}

## 🔍 Explore

- **Local Graph:** Right-click this file → "Open local graph"
- **Backlinks:** Open the right sidebar → "Backlinks"
- Use \`#type/${node.type}\` to find all ${typeLabel}s
- Use \`#${pkgTag}\` to find all files in this package
`;
}

// ── CSS Snippet ──

const DEVELOPER_CSS = `/* HamaFX-Ai Developer Vault — Custom CSS Snippet
 * Enhances the Obsidian vault for code architecture browsing.
 *
 * To enable: Settings → Appearance → CSS snippets → toggle "developer" on
 */

/* ── Callouts ── */
.callout[data-callout="danger"] {
  --callout-color: 220, 60, 60;
  border-left: 4px solid rgb(var(--callout-color));
}
.callout[data-callout="warning"] {
  --callout-color: 220, 180, 60;
  border-left: 4px solid rgb(var(--callout-color));
}

/* ── Tables ── */
.markdown-rendered table {
  font-size: 0.85em;
  border-collapse: collapse;
  width: 100%;
}
.markdown-rendered th {
  background: var(--table-header-background);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.75em;
  padding: 8px 12px;
}
.markdown-rendered td {
  padding: 6px 12px;
  border-bottom: 1px solid var(--table-border-color);
}

/* ── Dashboard Styling ── */
.dashboard .markdown-rendered h2 {
  border-bottom: 2px solid var(--text-accent);
  padding-bottom: 6px;
  margin-top: 28px;
}

/* ── Tags ── */
.tag[href="#type/package"],
.tag[href="#type/app"] { --tag-color: #e06c75; --tag-background: #e06c7533; }
.tag[href="#type/api_route"],
.tag[href="#type/route"] { --tag-color: #61afef; --tag-background: #61afef33; }
.tag[href="#type/component"] { --tag-color: #d19a66; --tag-background: #d19a6633; }
.tag[href="#type/tool"] { --tag-color: #56b6c2; --tag-background: #56b6c233; }
.tag[href="#type/table"] { --tag-color: #e5c07b; --tag-background: #e5c07b33; }
.tag[href="#type/agent"] { --tag-color: #c678dd; --tag-background: #c678dd33; }
.tag[href="#type/job"] { --tag-color: #d19a66; --tag-background: #d19a6633; }
.tag[href="#type/config"],
.tag[href="#type/schema"] { --tag-color: #abb2bf; --tag-background: #abb2bf33; }
.tag[href="#risk/high"] { --tag-color: #e06c75; --tag-background: #e06c7533; font-weight: 700; }
.tag[href="#risk/medium"] { --tag-color: #d19a66; --tag-background: #d19a6633; }

/* ── Graph View ── */
.workspace-leaf-content[data-type="graph"] .view-content {
  background: var(--background-primary);
}

/* ── Properties View ── */
.metadata-properties-heading { font-size: 0.85em !important; }
.metadata-property-key { font-size: 0.8em; opacity: 0.8; }
.metadata-property-value { font-family: var(--font-monospace); font-size: 0.85em; }

/* ── Links ── */
.internal-link { color: var(--text-accent); }
.internal-link:hover { text-decoration: underline; }

/* ── Code ── */
code {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', var(--font-monospace);
  font-size: 0.9em;
  background: var(--code-background);
  padding: 2px 6px;
  border-radius: 4px;
}

/* ── Scrollbar ── */
::-webkit-scrollbar { width: 8px; }
::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb-bg); border-radius: 4px; }
`;
