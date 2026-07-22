// SPDX-License-Identifier: Apache-2.0

// Deep Architecture Analysis Engine — detects architectural issues
// from the graph model: circular dependencies, hotspots, dead code,
// orphans, coupling, cohesion, dependency chains, and shared utilities.

import type { CyclicDep, Hotspot, DeadOrOrphan, ModuleMetrics, DepChain, AnalysisResults } from './types.js';
import { GraphModel } from './graph-model.js';

export function analyzeArchitecture(graph: GraphModel): AnalysisResults {
  const nodes = graph.getAllNodes();
  const edges = graph.getAllEdges();

  const cyclicDeps = findCycles(graph, nodes, edges);
  const hotspots = findHotspots(graph, nodes, edges);
  const deadOrOrphans = findDeadAndOrphans(graph, nodes);
  const sharedUtils = findSharedUtilities(graph, nodes);
  const metrics = computeModuleMetrics(graph, nodes);
  const depChains = findDependencyChains(graph, nodes);

  const avgCoupling = metrics.length > 0
    ? metrics.reduce((s, m) => s + m.couplingScore, 0) / metrics.length
    : 0;

  return {
    cyclicDependencies: cyclicDeps.slice(0, 50),
    hotspots: hotspots.slice(0, 30),
    deadOrOrphanFiles: deadOrOrphans.slice(0, 50),
    sharedUtilities: sharedUtils.slice(0, 30),
    moduleMetrics: metrics.slice(0, 100),
    dependencyChains: depChains.slice(0, 20),
    summary: {
      totalCycles: cyclicDeps.length,
      hotspotCount: hotspots.length,
      deadOrOrphanCount: deadOrOrphans.length,
      sharedUtilityCount: sharedUtils.length,
      avgCoupling: Math.round(avgCoupling * 100) / 100,
      maxChainLength: depChains.length > 0 ? Math.max(...depChains.map(c => c.length)) : 0,
    },
  };
}

// ── Circular Dependency Detection (Tarjan's SCC for strongly connected components) ──

function findCycles(graph: GraphModel, nodes: ReturnType<GraphModel['getAllNodes']>, edges: ReturnType<GraphModel['getAllEdges']>): CyclicDep[] {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    const srcId = typeof e.source === 'string' ? e.source : (e.source as unknown as {id:string}).id;
    const tgtId = typeof e.target === 'string' ? e.target : (e.target as unknown as {id:string}).id;
    if (typeof srcId === 'string' && typeof tgtId === 'string' && adj.has(srcId)) {
      adj.get(srcId)!.push(tgtId);
    }
  }

  // Tarjan's SCC algorithm
  let index = 0;
  const indices = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: CyclicDep[] = [];

  function strongConnect(v: string): void {
    indices.set(v, index);
    lowlink.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) || []) {
      if (!indices.has(w)) {
        strongConnect(w);
        lowlink.set(v, Math.min(lowlink.get(v)!, lowlink.get(w)!));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v)!, indices.get(w)!));
      }
    }

    if (lowlink.get(v)! === indices.get(v)!) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);

      if (scc.length > 1) {
        cycles.push({
          nodes: scc,
          length: scc.length,
        });
      }
    }
  }

  for (const n of nodes) {
    if (!indices.has(n.id)) strongConnect(n.id);
  }

  return cycles.sort((a, b) => b.length - a.length);
}

// ── Architecture Hotspot Detection ──

function findHotspots(graph: GraphModel, nodes: ReturnType<GraphModel['getAllNodes']>, edges: ReturnType<GraphModel['getAllEdges']>): Hotspot[] {
  const hotspots: Hotspot[] = [];

  // Count incoming and outgoing edges per node
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const n of nodes) { incoming.set(n.id, 0); outgoing.set(n.id, 0); }
  for (const e of edges) {
    const src = typeof e.source === 'string' ? e.source : (e.source as unknown as {id:string}).id;
    const tgt = typeof e.target === 'string' ? e.target : (e.target as unknown as {id:string}).id;
    if (typeof src === 'string') outgoing.set(src, (outgoing.get(src) || 0) + 1);
    if (typeof tgt === 'string') incoming.set(tgt, (incoming.get(tgt) || 0) + 1);
  }

  // Calculate hotspot score: (incoming × 2 + outgoing) / log of the ratio
  const scores: { nodeId: string; score: number; inc: number; out: number }[] = [];
  for (const n of nodes) {
    const inc = incoming.get(n.id) || 0;
    const out = outgoing.get(n.id) || 0;
    if (inc + out < 3) continue;
    const score = inc * 1.5 + out * 0.5 + Math.log2(inc + out + 1) * 3;
    scores.push({ nodeId: n.id, score, inc, out });
  }

  scores.sort((a, b) => b.score - a.score);

  for (const s of scores.slice(0, 50)) {
    const n = graph.getNode(s.nodeId);
    if (!n) continue;
    hotspots.push({
      nodeId: n.id,
      name: n.name,
      type: n.type,
      score: Math.round(s.score * 10) / 10,
      incoming: s.inc,
      outgoing: s.out,
    });
  }

  return hotspots;
}

// ── Dead Code & Orphan Detection ──

function findDeadAndOrphans(graph: GraphModel, nodes: ReturnType<GraphModel['getAllNodes']>): DeadOrOrphan[] {
  const results: DeadOrOrphan[] = [];
  const moduleNodes = nodes.filter(n => ['module', 'component', 'tool', 'agent'].includes(n.type));

  for (const n of moduleNodes) {
    const incoming = graph.getIncomingEdges(n.id);
    const outgoing = graph.getOutgoingEdges(n.id);
    const exports = (n.metadata as { exports?: string[] }).exports || [];

    // Skip well-known entry points: barrel files, page/layout/route handlers, CLI entries
    const entryPatterns = ['/index.ts', '/index.tsx', 'layout.tsx', 'page.tsx', 'route.ts', '/cli.ts', '/src/index.ts'];
    const isEntryPoint = entryPatterns.some(p => n.path.endsWith(p));
    if (isEntryPoint) continue;

    // Orphan: no incoming edges (nothing imports it)
    if (incoming.length === 0 && outgoing.length > 0 && exports.length === 0) {
      results.push({ nodeId: n.id, name: n.name, path: n.path, type: n.type, reason: 'no_imports' });
    }

    // Dead: no incoming, no exports
    if (incoming.length === 0 && exports.length === 0 && n.type === 'module') {
      results.push({ nodeId: n.id, name: n.name, path: n.path, type: n.type, reason: 'no_exports' });
    }

    // Unused: outgoing but no incoming (could be entry point or dead code)
    if (incoming.length === 0 && outgoing.length > 0) {
      results.push({ nodeId: n.id, name: n.name, path: n.path, type: n.type, reason: 'no_incoming' });
    }
  }

  return results;
}

// ── Shared Utility Detection ──

function findSharedUtilities(graph: GraphModel, nodes: ReturnType<GraphModel['getAllNodes']>): { nodeId: string; name: string; count: number }[] {
  const results: { nodeId: string; name: string; count: number }[] = [];

  for (const n of nodes) {
    const incoming = graph.getIncomingEdges(n.id);
    if (incoming.length >= 5) {
      results.push({ nodeId: n.id, name: n.name, count: incoming.length });
    }
  }

  results.sort((a, b) => b.count - a.count);
  return results.slice(0, 40);
}

// ── Module Coupling & Cohesion Metrics ──

function computeModuleMetrics(graph: GraphModel, nodes: ReturnType<GraphModel['getAllNodes']>): ModuleMetrics[] {
  const metrics: ModuleMetrics[] = [];

  for (const n of nodes) {
    if (!['module', 'component', 'tool', 'agent', 'api_route'].includes(n.type)) continue;

    const incoming = graph.getIncomingEdges(n.id);
    const outgoing = graph.getOutgoingEdges(n.id);
    const incCount = incoming.length;
    const outCount = outgoing.length;

    // Coupling: ratio of inter-package imports to total imports
    let interPkg = 0;
    for (const e of outgoing) {
      const target = graph.getNode(
        typeof e.target === 'string' ? e.target : (e.target as unknown as {id:string}).id
      );
      if (target && target.pkg !== n.pkg) interPkg++;
    }
    const couplingScore = outCount > 0 ? Math.round((interPkg / outCount) * 100) / 100 : 0;

    // Cohesion: 1 - (interPkg imports / total imports)
    const cohesionScore = outCount > 0 ? Math.round(((1 - interPkg / outCount) * 100)) / 100 : 1;

    metrics.push({
      nodeId: n.id,
      name: n.name,
      type: n.type,
      pkg: n.pkg,
      path: n.path,
      incomingCount: incCount,
      outgoingCount: outCount,
      couplingScore,
      cohesionScore,
    });
  }

  return metrics;
}

// ── Dependency Chain Detection (longest paths) ──

function findDependencyChains(graph: GraphModel, nodes: ReturnType<GraphModel['getAllNodes']>): DepChain[] {
  const chains: DepChain[] = [];

  // Find longest paths starting from nodes with no incoming edges
  const roots = nodes.filter(n => graph.getIncomingEdges(n.id).length === 0);

  for (const root of roots.slice(0, 20)) {
    const path = longestPathDFS(graph, root.id, new Set(), 10);
    if (path.length >= 3) {
      const startNode = graph.getNode(path[0]!);
      const endNode = graph.getNode(path[path.length - 1]!);
      chains.push({
        nodes: path,
        length: path.length,
        startName: startNode?.name || path[0]!,
        endName: endNode?.name || path[path.length - 1]!,
      });
    }
  }

  chains.sort((a, b) => b.length - a.length);
  return chains;
}

function longestPathDFS(graph: GraphModel, nodeId: string, visited: Set<string>, maxDepth: number): string[] {
  if (maxDepth <= 0 || visited.has(nodeId)) return [nodeId];
  visited.add(nodeId);

  let longest: string[] = [nodeId];
  const outgoing = graph.getOutgoingEdges(nodeId);

  for (const e of outgoing) {
    const tgtId = typeof e.target === 'string' ? e.target : (e.target as unknown as {id:string}).id;
    if (typeof tgtId !== 'string') continue;
    const subPath = longestPathDFS(graph, tgtId, new Set(visited), maxDepth - 1);
    if (subPath.length + 1 > longest.length) {
      longest = [nodeId, ...subPath];
    }
  }

  return longest;
}
