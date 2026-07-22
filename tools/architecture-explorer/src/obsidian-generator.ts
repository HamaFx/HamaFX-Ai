// SPDX-License-Identifier: Apache-2.0

// Obsidian vault generator — produces a folder of Markdown files with YAML
// frontmatter and wiki-links that Obsidian can open as a vault. Point
// Obsidian at docs/obsidian/ to get an interactive graph of the entire
// project architecture, with Dataview-powered dashboards.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import type { ArchitectureModel } from './types.js';

// ── Helpers ──

const ICONS: Record<string, string> = {
  package: '📦', app: '🚀', module: '📁', api_route: '🔗', component: '🧩',
  tool: '🔧', agent: '🤖', table: '🗄️', provider: '🌐', job: '⏰',
  service: '⚙️', middleware: '🛡️', config: '⚙️', schema: '📐', flow: '🔄',
};

const TYPES: Record<string, string> = {
  package: 'Package', app: 'Application', module: 'Module', api_route: 'API Route',
  component: 'Component', tool: 'AI Tool', agent: 'Agent', table: 'DB Table',
  provider: 'Provider', job: 'Job', service: 'Service', middleware: 'Middleware',
  config: 'Config', schema: 'Schema', flow: 'Flow',
};

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*#\[\]]/g, '-').replace(/\s+/g, '-').slice(0, 120);
}

/** Create a unique filename for a node, disambiguating same-named files across packages. */
function uniqueNodeFilename(node: any): string {
  const base = sanitizeFilename(node.name);
  // Check if the base name alone might collide — add package suffix for common names
  const commonNames = new Set(['index', 'route', 'page', 'layout', 'types', 'utils', 'config', 'schema', 'constants', 'helpers']);
  if (commonNames.has(base) && node.pkg) {
    const pkgShort = node.pkg.replace(/@hamafx\//, '').replace(/[^a-zA-Z0-9_-]/g, '-');
    return `${base}_${pkgShort}`;
  }
  return base;
}

/** Map from node name → sanitized filename for wiki-link resolution. */
function buildWikiLinkMap(nodes: any[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const node of nodes) {
    const filename = uniqueNodeFilename(node);
    // Store all variants for lookup
    map.set(node.name, filename);
    map.set(node.id, filename);
  }
  return map;
}

/** Create an Obsidian wiki-link that resolves correctly to the sanitized filename. */
function wikiLink(name: string, displayName: string | null, wikiMap: Map<string, string>): string {
  const target = wikiMap.get(name) || sanitizeFilename(name);
  if (target === sanitizeFilename(name)) {
    // No collision — simple [[name]] works
    return `[[${target}]]`;
  }
  // Use alias syntax for disambiguation
  return `[[${target}|${name}]]`;
}

function resolveNodeId(edge: { source: string | { id: string }; target: string | { id: string } }, field: 'source' | 'target'): string {
  const val = edge[field];
  return typeof val === 'string' ? val : (val as { id: string }).id;
}

// ── Main Generator ──

export function generateObsidianVault(model: ArchitectureModel, outputDir: string): void {
  // Ensure output directory exists
  mkdirSync(outputDir, { recursive: true });

  const nodeMap = new Map(model.nodes.map((n) => [n.id, n]));
  const wikiMap = buildWikiLinkMap(model.nodes);

  // Pre-compute connection counts (one pass over edges)
  const incomingCount = new Map<string, number>();
  const outgoingCount = new Map<string, number>();
  for (const n of model.nodes) {
    incomingCount.set(n.id, 0);
    outgoingCount.set(n.id, 0);
  }
  model.edges.forEach((e) => {
    const tgt = resolveNodeId(e, 'target');
    const src = resolveNodeId(e, 'source');
    incomingCount.set(tgt, (incomingCount.get(tgt) ?? 0) + 1);
    outgoingCount.set(src, (outgoingCount.get(src) ?? 0) + 1);
  });

  // --- DASHBOARD FILES ---
  generateDashboard(outputDir, model);
  generateTypeIndex(outputDir, model, nodeMap, wikiMap, incomingCount, outgoingCount);

  // --- NODE FILES ---
  // Mirror project folder structure
  let fileCount = 0;
  for (const node of model.nodes) {
    const dir = resolve(outputDir, dirname(node.path || ''));
    mkdirSync(dir, { recursive: true });

    const filename = uniqueNodeFilename(node) + '.md';
    const filePath = resolve(dir, filename);

    const content = generateNodeMarkdown(node, model, nodeMap, wikiMap, incomingCount, outgoingCount);
    writeFileSync(filePath, content, 'utf-8');
    fileCount++;
  }

  const dashCount = 2 + 6 + (model.analysis?.hotspots?.length ? 1 : 0) + (model.analysis?.cyclicDependencies?.length ? 1 : 0);
  console.log(`   Obsidian vault: ${fileCount} node files + ${dashCount} dashboards`);
}

// ── Dashboard Files ──

function generateDashboard(outputDir: string, model: ArchitectureModel): void {
  const a = model.analysis || {};
  const s = a.summary || {};

  let md = `---
type: dashboard
title: "HamaFX-Ai Architecture Dashboard"
tags: [dashboard]
---

# 🏗️ HamaFX-Ai Architecture Dashboard

> Auto-generated from the codebase. Open the **Graph View** (Ctrl+G) to see all connections.

## 📊 Summary

| Metric | Value |
|--------|-------|
| Total Nodes | ${model.nodes.length} |
| Total Edges | ${model.edges.length} |
| Packages | ${model.packages.length} |
| API Routes | ${model.nodes.filter((n) => n.type === 'api_route').length} |
| Database Tables | ${model.nodes.filter((n) => n.type === 'table').length} |
| AI Tools | ${model.nodes.filter((n) => n.type === 'tool').length} |
| Circular Deps | ${s.totalCycles ?? 0} |
| Hotspots | ${s.hotspotCount ?? 0} |
| Dead/Orphan Files | ${s.deadOrOrphanCount ?? 0} |

## 🔍 Dataview Queries

\`\`\`dataview
TABLE type, package, incoming, outgoing
FROM ""
SORT outgoing DESC
LIMIT 20
\`\`\`

## ⚠️ Hotspots

\`\`\`dataview
TABLE incoming, outgoing, risk
FROM ""
WHERE risk = "high" OR risk = "medium"
SORT incoming DESC
\`\`\`

## 📂 Quick Links

- [[_API Routes]] — All ${model.nodes.filter((n) => n.type === 'api_route').length} API endpoints
- [[_Database Tables]] — All ${model.nodes.filter((n) => n.type === 'table').length} database tables
- [[_AI Tools]] — All ${model.nodes.filter((n) => n.type === 'tool').length} AI tools
- [[_Hotspots]] — Top ${s.hotspotCount ?? 0} architecture hotspots
${(s.totalCycles ?? 0) > 0 ? `- [[_Circular Dependencies]] — ${s.totalCycles} circular dependency chains` : ''}
`;

  writeFileSync(resolve(outputDir, '_Dashboard.md'), md, 'utf-8');
}

function generateTypeIndex(outputDir: string, model: ArchitectureModel, nodeMap: Map<string, any>, wikiMap: Map<string, string>, incomingCount: Map<string, number>, outgoingCount: Map<string, number>): void {
  const typeConfigs = [
    { type: 'api_route', title: '_API Routes', icon: '🔗', desc: 'API endpoints' },
    { type: 'table', title: '_Database Tables', icon: '🗄️', desc: 'Database tables' },
    { type: 'tool', title: '_AI Tools', icon: '🔧', desc: 'AI tools' },
    { type: 'agent', title: '_Agents', icon: '🤖', desc: 'AI agents' },
    { type: 'component', title: '_Components', icon: '🧩', desc: 'React components' },
    { type: 'job', title: '_Background Jobs', icon: '⏰', desc: 'Background jobs' },
  ];

  for (const tc of typeConfigs) {
    const nodes = model.nodes.filter((n) => n.type === tc.type);
    if (nodes.length === 0) continue;

    const list = nodes
      .map((n) => `- ${wikiLink(n.name, null, wikiMap)} — \`${n.path || ''}\`  *(in: ${incomingCount.get(n.id) ?? 0}, out: ${outgoingCount.get(n.id) ?? 0})*`)
      .join('\n');

    const md = `---
type: index
category: "${tc.type}"
count: ${nodes.length}
tags: [index, ${tc.type}]
---

# ${tc.icon} ${TYPES[tc.type] || tc.type}s (${nodes.length})

## Dataview

\`\`\`dataview
TABLE package, path, incoming, outgoing
WHERE type = "${tc.type}"
SORT incoming DESC
\`\`\`

## Full List

${list}
`;

    writeFileSync(resolve(outputDir, `${tc.title}.md`), md, 'utf-8');
  }

  // --- Hotspots Dashboard ---
  const hotspots = model.analysis?.hotspots ?? [];
  if (hotspots.length > 0) {
    const list = hotspots.slice(0, 20)
      .map((h) => `- 🔥 ${wikiLink(h.name, null, wikiMap)} — score: **${h.score}** *(in: ${h.incoming}, out: ${h.outgoing})*`)
      .join('\n');

    const md = `---
type: dashboard
title: "Hotspots"
count: ${hotspots.length}
tags: [dashboard, analysis]
---

# 🔥 Architecture Hotspots

Files with the highest connectivity — changes here may cascade.

## Top Hotspots

${list}

## Dataview

\`\`\`dataview
TABLE incoming, outgoing, risk
WHERE risk = "high"
SORT incoming DESC
\`\`\`
`;
    writeFileSync(resolve(outputDir, '_Hotspots.md'), md, 'utf-8');
  }

  // --- Circular Dependencies Dashboard ---
  const cycles = model.analysis?.cyclicDependencies ?? [];
  if (cycles.length > 0) {
    const list = cycles.map((c) => {
      const linked = c.nodes.map((n) => {
        const node = model.nodes.find((x) => x.id === n);
        return node ? wikiLink(node.name, null, wikiMap) : n;
      }).join(' → ');
      return `- 🔄 ${c.length} nodes: ${linked}`;
    }).join('\n');

    const md = `---
type: dashboard
title: "Circular Dependencies"
count: ${cycles.length}
tags: [dashboard, analysis]
---

# 🔄 Circular Dependencies

## Found ${cycles.length} cycles

> Circular dependencies create tight coupling — extract shared interfaces to break them.

${list}
`;
    writeFileSync(resolve(outputDir, '_Circular Dependencies.md'), md, 'utf-8');
  }
}

function incomingCountFor(nodeId: string, model: ArchitectureModel): number {
  return model.edges.filter((e) => resolveNodeId(e, 'target') === nodeId).length;
}

function outgoingCountFor(nodeId: string, model: ArchitectureModel): number {
  return model.edges.filter((e) => resolveNodeId(e, 'source') === nodeId).length;
}

// ── Individual Node Markdown ──

function generateNodeMarkdown(
  node: any,
  model: ArchitectureModel,
  nodeMap: Map<string, any>,
  wikiMap: Map<string, string>,
  incomingCount: Map<string, number>,
  outgoingCount: Map<string, number>,
): string {
  const inc = incomingCount.get(node.id) ?? 0;
  const out = outgoingCount.get(node.id) ?? 0;
  const risk = inc > 20 ? 'high' : inc > 10 ? 'medium' : 'low';
  const icon = ICONS[node.type] || '📄';
  const typeLabel = TYPES[node.type] || node.type;

  // Build wiki-links for connections
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

  const outgoingLinks = [...outgoing].slice(0, 15).map((name) => wikiLink(name, null, wikiMap)).join(' · ');
  const incomingLinks = [...incoming].slice(0, 15).map((name) => wikiLink(name, null, wikiMap)).join(' · ');

  return `---
type: ${node.type}
package: "${node.pkg || '(root)'}"
path: "${node.path || ''}"
incoming: ${inc}
outgoing: ${out}
risk: ${risk}
tags: [${node.type}, ${(node.pkg || 'root').replace(/[@/]/g, '')}]
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
| Risk level | ${risk.toUpperCase()} |

${outgoingLinks ? `\n### 📤 Depends On\n${outgoingLinks}\n` : ''}
${incomingLinks ? `\n### 📥 Depended On By\n${incomingLinks}\n` : ''}

${node.metadata?.exports?.length ? `\n## 📦 Exports\n${(node.metadata.exports as string[]).slice(0, 15).map((e) => `- \`${e}\``).join('\n')}\n` : ''}
`;
}
