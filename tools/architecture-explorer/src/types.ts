// SPDX-License-Identifier: Apache-2.0

// Shared types for the architecture explorer.

export type NodeType =
  | 'package'
  | 'app'
  | 'module'
  | 'api_route'
  | 'component'
  | 'tool'
  | 'agent'
  | 'table'
  | 'provider'
  | 'job'
  | 'service'
  | 'middleware'
  | 'config'
  | 'schema'
  | 'flow';

export type EdgeType =
  | 'depends_on'
  | 'imports'
  | 'calls'
  | 'extends'
  | 'implements'
  | 'registers'
  | 'writes_to'
  | 'reads_from'
  | 'routes_to'
  | 'falls_back_to'
  | 'triggers'
  | 'belongs_to'
  | 'streams_to'
  | 'validates'
  | 'embeds';

export interface ArchNode {
  id: string;
  type: NodeType;
  name: string;
  pkg: string;
  path: string;
  description: string;
  metadata: Record<string, unknown>;
}

export interface ArchEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  metadata: Record<string, unknown>;
}

export interface ViewDefinition {
  name: string;
  description: string;
  nodeTypes: NodeType[];
  edgeTypes: EdgeType[];
  layout: 'force-directed' | 'tree' | 'radial' | 'flowchart' | 'grid' | 'er';
  groupBy?: string;
}

export interface ArchitectureModel {
  version: string;
  generatedAt: string;
  project: {
    name: string;
    rootPath: string;
    description: string;
    license: string;
    repository: string;
    techStack: Record<string, string>;
  };
  packages: {
    id: string;
    name: string;
    path: string;
    type: string;
    description: string;
    dependsOn: string[];
    exports: string[];
  }[];
  nodes: ArchNode[];
  edges: ArchEdge[];
  views: Record<string, ViewDefinition>;
  analysis: AnalysisResults;
  /** Phase 8: Git history for architecture evolution. */
  gitHistory: GitHistory | null;
  /** Phase 8: Architecture evolution timeline for playback. */
  evolutionTimeline: EvolutionTimelineEntry[];
  /** Phase 8: Smart summaries per view. */
  smartSummaries: ViewSummaryEntry[];
  /** Phase 8: Intelligent recommendations. */
  recommendations: Recommendation[];
  /** Phase 8: Plugin hook definitions. */
  pluginHooks: PluginHookEntry[];
}

export interface ScanOptions {
  rootDir: string;
  outputPath?: string;
  verbose?: boolean;
}

export interface ParsedFile {
  path: string;
  relativePath: string;
  pkg: string;
  imports: ImportInfo[];
  exports: ExportInfo[];
  classes: ClassInfo[];
  functions: FunctionInfo[];
  isApiRoute: boolean;
  httpMethod?: string;
  routePath?: string;
  isDrizzleSchema: boolean;
  tableDefs: TableInfo[];
  isAiTool: boolean;
  toolName?: string;
  toolDescription?: string;
  isAgent: boolean;
  agentName?: string;
  isComponent: boolean;
}

export interface ImportInfo {
  source: string;
  symbols: string[];
  isDefault: boolean;
  isTypeOnly: boolean;
}

export interface ExportInfo {
  name: string;
  kind: 'function' | 'class' | 'const' | 'type' | 'interface' | 'default';
  isDefault: boolean;
}

export interface ClassInfo {
  name: string;
  extendsName?: string;
  implementsNames: string[];
  methods: string[];
}

export interface FunctionInfo {
  name: string;
  isAsync: boolean;
  isExported: boolean;
}

export interface TableInfo {
  name: string;
  columns: string[];
}

// ── Analysis types ──

export interface CyclicDep {
  nodes: string[];
  length: number;
}

export interface Hotspot {
  nodeId: string;
  name: string;
  type: string;
  score: number;
  incoming: number;
  outgoing: number;
}

export interface DeadOrOrphan {
  nodeId: string;
  name: string;
  path: string;
  type: string;
  reason: 'no_imports' | 'no_incoming' | 'no_exports';
}

export interface ModuleMetrics {
  nodeId: string;
  name: string;
  type: string;
  pkg: string;
  path: string;
  incomingCount: number;
  outgoingCount: number;
  couplingScore: number;
  cohesionScore: number;
}

export interface DepChain {
  nodes: string[];
  length: number;
  startName: string;
  endName: string;
}

export interface AnalysisResults {
  cyclicDependencies: CyclicDep[];
  hotspots: Hotspot[];
  deadOrOrphanFiles: DeadOrOrphan[];
  sharedUtilities: { nodeId: string; name: string; count: number }[];
  moduleMetrics: ModuleMetrics[];
  dependencyChains: DepChain[];
  summary: {
    totalCycles: number;
    hotspotCount: number;
    deadOrOrphanCount: number;
    sharedUtilityCount: number;
    avgCoupling: number;
    maxChainLength: number;
  };
}

// ── Phase 8: Advanced Features ──

/** Impact analysis result — what depends on a given node and what it depends on. */
export interface ImpactAnalysis {
  nodeId: string;
  nodeName: string;
  /** All nodes that are directly or transitively downstream (depend on this node). */
  affectedNodes: string[];
  /** All nodes that are directly or transitively upstream (this node depends on). */
  dependsOnNodes: string[];
  /** Direct downstream nodes only. */
  directDependents: string[];
  /** Direct upstream nodes only. */
  directDependencies: string[];
  /** Risk score 0-100: how risky it is to change this node. */
  riskScore: number;
}

/** A named snapshot of graph state for comparison. */
export interface GraphSnapshot {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  nodeCount: number;
  edgeCount: number;
  viewKey: string;
  /** Node IDs present in this snapshot. */
  nodeIds: string[];
  /** Edge IDs present in this snapshot. */
  edgeIds: string[];
  /** Saved layout positions for each node. */
  positions: Record<string, { x: number; y: number }>;
}

/** Diff between two snapshots. */
export interface SnapshotDiff {
  snapshotA: string;
  snapshotB: string;
  addedNodes: string[];
  removedNodes: string[];
  addedEdges: string[];
  removedEdges: string[];
  modifiedNodes: string[];
}

/** A smart recommendation for architecture improvement. */
export interface Recommendation {
  id: string;
  title: string;
  description: string;
  severity: 'high' | 'medium' | 'low' | 'info';
  category: 'coupling' | 'cohesion' | 'size' | 'circular_dep' | 'dead_code' | 'structure';
  affectedNodes: string[];
  suggestion: string;
}

/** Git history data for architecture evolution. */
export interface GitHistory {
  commits: GitCommit[];
  /** File → array of commit hashes that touched it. */
  fileChanges: Record<string, string[]>;
  /** Node ID → array of commit hashes. */
  nodeChanges: Record<string, string[]>;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  date: string;
  author: string;
  message: string;
  files: string[];
}

/** Architecture evolution timeline entry for animated playback. */
export interface EvolutionTimelineEntry {
  date: string;
  hash: string;
  shortHash: string;
  message: string;
  activeNodeCount: number;
  touchedNodes: string[];
}

/** Smart summary for a single architecture view. */
export interface ViewSummaryEntry {
  viewKey: string;
  title: string;
  summary: string;
  stats: { label: string; value: string }[];
  highlights: string[];
  warnings: string[];
}

/** Plugin hook definition for extensibility. */
export interface PluginHookEntry {
  name: string;
  description: string;
  event: string;
  handlerSignature: string;
}
