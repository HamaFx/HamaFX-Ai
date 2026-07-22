// SPDX-License-Identifier: Apache-2.0

// Advanced features engine — impact analysis, smart summaries,
// intelligent recommendations, graph snapshots, and version comparison.

import type {
  ArchitectureModel,
  ImpactAnalysis,
  GraphSnapshot,
  SnapshotDiff,
  Recommendation,
  ViewDefinition,
} from './types.js';

// ═══════════════════════════════════════════════════════════════════════
// IMPACT ANALYSIS — "What breaks if I change this?"
// ═══════════════════════════════════════════════════════════════════════

/**
 * Computes the full impact of changing a node:
 * - What depends on it (downstream / affected)
 * - What it depends on (upstream / dependencies)
 * - Direct vs transitive
 * - Risk score
 */
export function analyzeImpact(
  nodeId: string,
  model: ArchitectureModel,
): ImpactAnalysis | null {
  const node = model.nodes.find((n) => n.id === nodeId);
  if (!node) return null;

  // Build adjacency
  const outgoing = new Map<string, string[]>(); // source → [targets]
  const incoming = new Map<string, string[]>(); // target → [sources]

  for (const n of model.nodes) {
    outgoing.set(n.id, []);
    incoming.set(n.id, []);
  }

  for (const edge of model.edges) {
    const s = typeof edge.source === 'string' ? edge.source : (edge.source as { id: string }).id;
    const t = typeof edge.target === 'string' ? edge.target : (edge.target as { id: string }).id;
    outgoing.get(s)?.push(t);
    incoming.get(t)?.push(s);
  }

  // BFS downstream (who depends on me, directly and transitively)
  const affected = bfs(nodeId, incoming);

  // BFS upstream (who I depend on, directly and transitively)
  const dependsOn = bfs(nodeId, outgoing);

  // Direct neighbors
  const directDependents = (incoming.get(nodeId) ?? []).filter((id) => id !== nodeId);
  const directDependencies = (outgoing.get(nodeId) ?? []).filter((id) => id !== nodeId);

  // Risk score: weighted by number of affected nodes, their types
  const riskScore = Math.min(
    100,
    Math.round(
      affected.length * 2.5 +
      directDependents.filter((id) => {
        const n = model.nodes.find((x) => x.id === id);
        return n && (n.type === 'api_route' || n.type === 'app' || n.type === 'package');
      }).length * 10,
    ),
  );

  return {
    nodeId,
    nodeName: node.name,
    affectedNodes: affected,
    dependsOnNodes: dependsOn,
    directDependents,
    directDependencies,
    riskScore,
  };
}

function bfs(start: string, adj: Map<string, string[]>): string[] {
  const visited = new Set<string>();
  const queue = [start];
  visited.add(start);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of adj.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  visited.delete(start);
  return [...visited];
}

// ═══════════════════════════════════════════════════════════════════════
// SMART SUMMARIES
// ═══════════════════════════════════════════════════════════════════════

export interface ViewSummary {
  viewKey: string;
  title: string;
  summary: string;
  stats: { label: string; value: string }[];
  highlights: string[];
  warnings: string[];
}

/**
 * Generates a human-readable summary for each architecture view.
 */
export function generateSmartSummaries(model: ArchitectureModel): ViewSummary[] {
  const summaries: ViewSummary[] = [];

  for (const [key, view] of Object.entries(model.views)) {
    const visibleNodes = model.nodes.filter((n) =>
      (view.nodeTypes as string[]).includes(n.type),
    );
    const visibleEdges = model.edges.filter((e) => {
      const s = typeof e.source === 'string' ? e.source : (e.source as { id: string }).id;
      const t = typeof e.target === 'string' ? e.target : (e.target as { id: string }).id;
      const sn = model.nodes.find((n) => n.id === s);
      const tn = model.nodes.find((n) => n.id === t);
      return (
        (view.edgeTypes as string[]).includes(e.type) &&
        sn &&
        tn &&
        (view.nodeTypes as string[]).includes(sn.type) &&
        (view.nodeTypes as string[]).includes(tn.type)
      );
    });

    const nodeTypeCounts: Record<string, number> = {};
    visibleNodes.forEach((n) => {
      nodeTypeCounts[n.type] = (nodeTypeCounts[n.type] ?? 0) + 1;
    });

    const edgeTypeCounts: Record<string, number> = {};
    visibleEdges.forEach((e) => {
      edgeTypeCounts[e.type] = (edgeTypeCounts[e.type] ?? 0) + 1;
    });

    const stats = [
      { label: 'Nodes', value: String(visibleNodes.length) },
      { label: 'Edges', value: String(visibleEdges.length) },
    ];

    const highlights: string[] = [];
    const warnings: string[] = [];

    if (visibleNodes.length === 0) {
      warnings.push('No nodes visible in this view.');
    }
    if (visibleEdges.length === 0 && visibleNodes.length > 1) {
      warnings.push('No connections between visible nodes — isolated components detected.');
    }
    if (visibleNodes.length > 100) {
      highlights.push(`Large view with ${visibleNodes.length} nodes — use search or filters for focused exploration.`);
    }

    // Package diversity
    const packages = new Set(visibleNodes.map((n) => n.pkg).filter(Boolean));
    if (packages.size > 5) {
      highlights.push(`Spans ${packages.size} packages — indicates broad cross-cutting architecture.`);
    }

    // Density
    if (visibleNodes.length > 1) {
      const density = visibleEdges.length / visibleNodes.length;
      if (density < 0.5) {
        warnings.push(`Low connectivity (${density.toFixed(1)} edges/node) — possible fragmentation.`);
      } else if (density > 5) {
        highlights.push(`High connectivity (${density.toFixed(1)} edges/node) — tightly integrated components.`);
      }
    }

    // Generate narrative summary
    const typeList = Object.entries(nodeTypeCounts)
      .map(([t, c]) => `${c} ${t}${c > 1 ? 's' : ''}`)
      .join(', ');
    const summary = `${view.name}: Contains ${typeList || 'no nodes'} with ${visibleEdges.length} connections${packages.size > 1 ? ` across ${packages.size} packages` : ''}.`;

    summaries.push({
      viewKey: key,
      title: view.name,
      summary,
      stats,
      highlights,
      warnings,
    });
  }

  return summaries;
}

// ═══════════════════════════════════════════════════════════════════════
// INTELLIGENT RECOMMENDATIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generates actionable architecture improvement recommendations.
 */
export function generateRecommendations(model: ArchitectureModel): Recommendation[] {
  const recs: Recommendation[] = [];
  let id = 0;

  // 1. Circular dependencies are always bad
  for (const cycle of model.analysis.cyclicDependencies ?? []) {
    recs.push({
      id: `rec-${++id}`,
      title: `Break circular dependency (${cycle.length} nodes)`,
      description: `Circular dependency detected among: ${cycle.nodes.slice(0, 4).join(', ')}${cycle.nodes.length > 4 ? ` +${cycle.nodes.length - 4} more` : ''}. Extract shared interface or use dependency inversion.`,
      severity: 'high',
      category: 'circular_dep',
      affectedNodes: cycle.nodes,
      suggestion: 'Extract a shared interface/type into a new package or use dependency inversion (depend on abstractions, not concretions).',
    });
  }

  // 2. High-coupling modules
  for (const metric of model.analysis.moduleMetrics ?? []) {
    if (metric.couplingScore > 0.8 && metric.outgoingCount > 5) {
      recs.push({
        id: `rec-${++id}`,
        title: `Reduce coupling in "${metric.name}"`,
        description: `"${metric.name}" has ${(metric.couplingScore * 100).toFixed(0)}% cross-package coupling (${metric.outgoingCount} outgoing deps). Consider splitting or introducing a facade.`,
        severity: metric.couplingScore > 0.9 ? 'high' : 'medium',
        category: 'coupling',
        affectedNodes: [metric.nodeId],
        suggestion: 'Consider splitting this module or introducing a facade/API layer to reduce direct cross-package imports.',
      });
    }
  }

  // 3. Large packages (many nodes in one package)
  const packageNodeCounts = new Map<string, number>();
  model.nodes.forEach((n) => {
    if (n.pkg) {
      packageNodeCounts.set(n.pkg, (packageNodeCounts.get(n.pkg) ?? 0) + 1);
    }
  });
  for (const [pkg, count] of packageNodeCounts) {
    if (count > 80) {
      recs.push({
        id: `rec-${++id}`,
        title: `Large package: "${pkg}"`,
        description: `"${pkg}" contains ${count} modules — consider splitting into sub-packages for better maintainability.`,
        severity: count > 150 ? 'high' : 'medium',
        category: 'size',
        affectedNodes: model.nodes.filter((n) => n.pkg === pkg).map((n) => n.id),
        suggestion: `Split "${pkg}" into smaller sub-packages organized by feature or layer.`,
      });
    }
  }

  // 4. Dead code / orphans
  const deadCount = model.analysis.deadOrOrphanFiles?.length ?? 0;
  if (deadCount > 10) {
    recs.push({
      id: `rec-${++id}`,
      title: `${deadCount} potentially dead/orphan files`,
      description: `Found ${deadCount} files with no incoming dependencies or exports. Review and remove unused code to reduce maintenance burden.`,
      severity: deadCount > 50 ? 'medium' : 'low',
      category: 'dead_code',
      affectedNodes: (model.analysis.deadOrOrphanFiles ?? []).map((d) => d.nodeId),
      suggestion: 'Review each file and either integrate it into the architecture or remove it. Consider adding barrel exports for genuinely useful utilities.',
    });
  }

  // 5. Hotspot recommendations
  const hotspots = model.analysis.hotspots ?? [];
  if (hotspots.length > 0) {
    const top3 = hotspots.slice(0, 3);
    recs.push({
      id: `rec-${++id}`,
      title: `Architecture hotspots identified`,
      description: `Top 3 hotspots: ${top3.map((h) => `"${h.name}" (score: ${h.score})`).join(', ')}. These files are frequently imported and changes may cascade.`,
      severity: hotspots[0]!.score > 80 ? 'high' : 'medium',
      category: 'structure',
      affectedNodes: top3.map((h) => h.nodeId),
      suggestion: 'Consider stabilizing hotspot interfaces with explicit contracts, adding comprehensive tests, and documenting change impact.',
    });
  }

  // 6. Low cohesion modules
  for (const metric of model.analysis.moduleMetrics ?? []) {
    if (metric.cohesionScore < 0.2 && metric.outgoingCount > 3) {
      recs.push({
        id: `rec-${++id}`,
        title: `Low cohesion in "${metric.name}"`,
        description: `"${metric.name}" has ${(metric.cohesionScore * 100).toFixed(0)}% cohesion — it imports from many different packages. Consider refactoring.`,
        severity: 'medium',
        category: 'cohesion',
        affectedNodes: [metric.nodeId],
        suggestion: 'This module may be doing too many things. Consider splitting responsibilities across focused modules.',
      });
    }
    // Limit total recommendations
    if (recs.length >= 25) break;
  }

  return recs;
}

// ═══════════════════════════════════════════════════════════════════════
// GRAPH SNAPSHOTS & COMPARISON
// ═══════════════════════════════════════════════════════════════════════

/**
 * Creates a snapshot of the current graph state.
 */
export function createSnapshot(
  id: string,
  name: string,
  description: string,
  model: ArchitectureModel,
  viewKey: string,
  positions?: Record<string, { x: number; y: number }>,
): GraphSnapshot {
  return {
    id,
    name,
    description,
    createdAt: new Date().toISOString(),
    nodeCount: model.nodes.length,
    edgeCount: model.edges.length,
    viewKey,
    nodeIds: model.nodes.map((n) => n.id),
    edgeIds: model.edges.map((e) => e.id),
    positions: positions ?? {},
  };
}

/**
 * Computes the diff between two snapshots.
 */
export function compareSnapshots(
  snapA: GraphSnapshot,
  snapB: GraphSnapshot,
  model: ArchitectureModel,
): SnapshotDiff {
  const setA = new Set(snapA.nodeIds);
  const setB = new Set(snapB.nodeIds);
  const edgeA = new Set(snapA.edgeIds);
  const edgeB = new Set(snapB.edgeIds);

  const addedNodes = [...setB].filter((id) => !setA.has(id));
  const removedNodes = [...setA].filter((id) => !setB.has(id));
  const addedEdges = [...edgeB].filter((id) => !edgeA.has(id));
  const removedEdges = [...edgeA].filter((id) => !edgeB.has(id));

  // Modified nodes: present in both but positions changed significantly
  const modifiedNodes: string[] = [];
  for (const id of setA) {
    if (setB.has(id) && snapA.positions[id] && snapB.positions[id]) {
      const dx = snapA.positions[id]!.x - snapB.positions[id]!.x;
      const dy = snapA.positions[id]!.y - snapB.positions[id]!.y;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        modifiedNodes.push(id);
      }
    }
  }

  return {
    snapshotA: snapA.id,
    snapshotB: snapB.id,
    addedNodes,
    removedNodes,
    addedEdges,
    removedEdges,
    modifiedNodes,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// EXTENSIBILITY — Plugin hook registry
// ═══════════════════════════════════════════════════════════════════════

export type PluginHookName = 'onNodeClick' | 'onViewSwitch' | 'onLayoutChange' | 'onSearch' | 'onExport';

export interface PluginHook {
  name: string;
  description: string;
  /** Hook registration point so the HTML can call registered plugins. */
  registration: {
    event: PluginHookName;
    handlerSignature: string; // JS function signature for documentation
  };
}

/**
 * Returns the plugin hook definitions for the HTML to expose.
 */
export function getPluginHooks(): PluginHook[] {
  return [
    {
      name: 'onNodeClick',
      description: 'Fired when a node is clicked. Receives (nodeData, event).',
      registration: { event: 'onNodeClick', handlerSignature: '(node: ArchNode, event: MouseEvent) => void' },
    },
    {
      name: 'onViewSwitch',
      description: 'Fired when the view is changed. Receives (viewKey, viewDef).',
      registration: { event: 'onViewSwitch', handlerSignature: '(viewKey: string, viewDef: ViewDefinition) => void' },
    },
    {
      name: 'onLayoutChange',
      description: 'Fired when the layout is changed. Receives (layoutKey).',
      registration: { event: 'onLayoutChange', handlerSignature: '(layoutKey: string) => void' },
    },
    {
      name: 'onSearch',
      description: 'Fired when search is performed. Receives (query, results).',
      registration: { event: 'onSearch', handlerSignature: '(query: string, results: ArchNode[]) => void' },
    },
    {
      name: 'onExport',
      description: 'Fired when data is exported. Receives (format, data).',
      registration: { event: 'onExport', handlerSignature: '(format: "png"|"svg"|"json", data: any) => void' },
    },
  ];
}
