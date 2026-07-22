// SPDX-License-Identifier: Apache-2.0

// JSON generator — serializes the graph model to the architecture JSON format.

import type { ArchitectureModel, ViewDefinition, GitHistory, EvolutionTimelineEntry, ViewSummaryEntry, Recommendation, PluginHookEntry } from './types.js';
import { GraphModel } from './graph-model.js';
import { analyzeArchitecture } from './analysis.js';
import { type ViewSummary, generateSmartSummaries, generateRecommendations, getPluginHooks } from './advanced-features.js';
import { scanGitHistory, buildEvolutionTimeline, buildNodePathMap } from './git-history.js';

const ALL_NODE_TYPES = [
  'package', 'app', 'module', 'api_route', 'component', 'tool',
  'agent', 'table', 'provider', 'job', 'service', 'middleware',
  'config', 'schema', 'flow',
] as const;

const ALL_EDGE_TYPES = [
  'depends_on', 'imports', 'calls', 'extends', 'implements',
  'registers', 'writes_to', 'reads_from', 'routes_to',
  'falls_back_to', 'triggers', 'belongs_to', 'streams_to',
  'validates', 'embeds',
] as const;

const VIEWS: Record<string, ViewDefinition> = {
  overall_architecture: {
    name: 'Overall Architecture',
    description: 'High-level package and application relationships. See how monorepo packages, apps, and external providers connect.',
    nodeTypes: ['package', 'app', 'provider'],
    edgeTypes: ['depends_on', 'falls_back_to', 'streams_to'],
    layout: 'force-directed',
  },
  feature_map: {
    name: 'Feature Map',
    description: 'Feature-to-module mapping showing which files implement which capabilities.',
    nodeTypes: ['module'],
    edgeTypes: ['belongs_to'],
    layout: 'grid',
    groupBy: 'pkg',
  },
  folder_structure: {
    name: 'Folder Structure',
    description: 'Actual filesystem hierarchy of the project.',
    nodeTypes: ['package', 'module', 'api_route'],
    edgeTypes: ['belongs_to'],
    layout: 'tree',
  },
  dependency_graph: {
    name: 'Dependency Graph',
    description: 'Directed graph of import and call dependencies between all modules.',
    nodeTypes: ['package', 'module', 'api_route', 'component', 'tool', 'agent'],
    edgeTypes: ['depends_on', 'imports', 'calls'],
    layout: 'force-directed',
  },
  api_explorer: {
    name: 'API Explorer',
    description: 'All API endpoints organized by domain with their handler relationships.',
    nodeTypes: ['api_route'],
    edgeTypes: ['belongs_to', 'calls'],
    layout: 'radial',
    groupBy: 'domain',
  },
  database_explorer: {
    name: 'Database Explorer',
    description: 'All database tables with foreign key relationships and their schema files.',
    nodeTypes: ['table', 'module'],
    edgeTypes: ['belongs_to', 'writes_to', 'reads_from'],
    layout: 'er',
  },
  authentication_flow: {
    name: 'Authentication Flow',
    description: 'Auth pipeline: middleware → NextAuth → database sessions.',
    nodeTypes: ['middleware', 'api_route', 'table'],
    edgeTypes: ['routes_to', 'writes_to', 'reads_from'],
    layout: 'flowchart',
  },
  ai_workflow: {
    name: 'AI Workflow',
    description: 'Chat pipeline: routing → planning → tools → response.',
    nodeTypes: ['module', 'tool', 'flow'],
    edgeTypes: ['calls', 'registers'],
    layout: 'flowchart',
  },
  tool_execution: {
    name: 'Tool Execution Flow',
    description: 'All 32 AI tools with their input/output schemas and dependencies.',
    nodeTypes: ['tool', 'schema', 'module'],
    edgeTypes: ['calls', 'validates', 'registers'],
    layout: 'force-directed',
  },
  request_lifecycle: {
    name: 'Request Lifecycle',
    description: 'Full HTTP request flow: middleware → route → agent → tools → persistence.',
    nodeTypes: ['middleware', 'api_route', 'module', 'tool'],
    edgeTypes: ['routes_to', 'calls', 'writes_to'],
    layout: 'flowchart',
  },
  background_jobs: {
    name: 'Background Jobs',
    description: 'Worker daemon: SignalR → tick buffer → candles → cron jobs.',
    nodeTypes: ['job', 'service', 'table'],
    edgeTypes: ['triggers', 'streams_to', 'writes_to'],
    layout: 'flowchart',
  },
  infrastructure: {
    name: 'Infrastructure',
    description: 'Deployment topology: Vercel + GCE VM + Docker + Supabase.',
    nodeTypes: ['app', 'provider', 'service'],
    edgeTypes: ['depends_on', 'falls_back_to', 'streams_to'],
    layout: 'force-directed',
  },
  runtime_architecture: {
    name: 'Runtime Architecture',
    description: 'Runtime processes, connections, and services.',
    nodeTypes: ['service', 'app'],
    edgeTypes: ['depends_on', 'streams_to'],
    layout: 'force-directed',
  },
  build_architecture: {
    name: 'Build Architecture',
    description: 'Turborepo build order and package dependencies.',
    nodeTypes: ['package', 'config'],
    edgeTypes: ['depends_on'],
    layout: 'flowchart',
  },
  state_management: {
    name: 'State Management',
    description: 'React state → server state → database state flows.',
    nodeTypes: ['component', 'table', 'service'],
    edgeTypes: ['reads_from', 'writes_to'],
    layout: 'flowchart',
  },
  configuration: {
    name: 'Configuration',
    description: 'Config files, feature flags, and environment variable locations.',
    nodeTypes: ['config', 'module'],
    edgeTypes: ['belongs_to', 'imports'],
    layout: 'grid',
  },
  environment_variables: {
    name: 'Environment Variables',
    description: 'All environment variables with their usage locations.',
    nodeTypes: ['config', 'module'],
    edgeTypes: ['reads_from'],
    layout: 'grid',
  },
};

export function generateArchitectureJson(
  graph: GraphModel,
  packageNames: Set<string>,
  rootDir: string,
): ArchitectureModel {
  const analysis = analyzeArchitecture(graph);
  const packages = [...packageNames].map((name) => {
    const pkgNode = [...graph.getAllNodes()].find((n) => n.type === 'package' && n.name === name);
    const allNodes = graph.getAllNodes().filter((n) => n.pkg === name);
    return {
      id: `pkg:${name.replace(/[@/]/g, '_')}`,
      name,
      path: name.replace('@hamafx/', 'packages/').replace('tool:', 'tools/'),
      type: 'package',
      description: `Package: ${name} (${allNodes.length} nodes)`,
      dependsOn: allNodes
        .flatMap((n) => graph.getOutgoingEdges(n.id))
        .filter((e) => e.type === 'depends_on')
        .map((e) => graph.getNode(e.target)?.name ?? '')
        .filter((n, i, a) => n && a.indexOf(n) === i),
      exports: allNodes.flatMap((n) => {
        const meta = n.metadata as { exports?: string[] };
        return meta.exports ?? [];
      }),
    };
  });

  const nodes = graph.getAllNodes();
  const edges = graph.getAllEdges();

  // Phase 8: Git history
  let gitHistory: GitHistory | null = null;
  let evolutionTimeline: EvolutionTimelineEntry[] = [];
  try {
    gitHistory = scanGitHistory({ rootDir, maxCommits: 500 });
    if (gitHistory) {
      const nodeIdByPath = buildNodePathMap(
        nodes.map((n) => n.id),
        (id) => nodes.find((n) => n.id === id)?.path,
      );
      // Map node changes
      for (const [filePath, commitHashes] of Object.entries(gitHistory.fileChanges)) {
        const nodeId = nodeIdByPath.get(filePath);
        if (nodeId) {
          gitHistory.nodeChanges[nodeId] = commitHashes;
        }
      }
      evolutionTimeline = buildEvolutionTimeline(gitHistory, nodeIdByPath);
    }
  } catch {
    gitHistory = null;
    evolutionTimeline = [];
  }

  // Phase 8: Smart summaries
  const modelForFeatures: ArchitectureModel = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    project: {
      name: 'HamaFX-Ai',
      rootPath: rootDir,
      description: 'Multi-tenant, chat-driven AI trading copilot for forex instruments (XAUUSD, EURUSD, GBPUSD)',
      license: 'Apache-2.0',
      repository: 'github.com/HamaFx/HamaFX-Ai',
      techStack: {
        runtime: 'Node.js >= 20.11',
        packageManager: 'pnpm 9.15.4',
        framework: 'Next.js 15 (App Router) + React 19',
        language: 'TypeScript (strict)',
        styling: 'Tailwind CSS v4 + shadcn/ui (Radix)',
        ai: 'Vercel AI SDK v5',
        database: 'PostgreSQL (Supabase) + pgvector + Drizzle ORM',
        charts: 'TradingView lightweight-charts v5',
        monorepo: 'Turborepo 2',
        auth: 'NextAuth.js v5 (Credentials, JWT)',
      },
    },
    packages,
    nodes,
    edges,
    views: VIEWS,
    analysis,
    gitHistory,
    evolutionTimeline,
    smartSummaries: [],
    recommendations: [],
    pluginHooks: [],
  };

  const summaryViews = generateSmartSummaries(modelForFeatures);
  const smartSummaries: ViewSummaryEntry[] = summaryViews.map((s) => ({
    viewKey: s.viewKey,
    title: s.title,
    summary: s.summary,
    stats: s.stats,
    highlights: s.highlights,
    warnings: s.warnings,
  }));

  const recommendations = generateRecommendations(modelForFeatures);
  const pluginHooks: PluginHookEntry[] = getPluginHooks().map((h) => ({
    name: h.name,
    description: h.description,
    event: h.registration.event,
    handlerSignature: h.registration.handlerSignature,
  }));

  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    project: {
      name: 'HamaFX-Ai',
      rootPath: rootDir,
      description: 'Multi-tenant, chat-driven AI trading copilot for forex instruments (XAUUSD, EURUSD, GBPUSD)',
      license: 'Apache-2.0',
      repository: 'github.com/HamaFx/HamaFX-Ai',
      techStack: {
        runtime: 'Node.js >= 20.11',
        packageManager: 'pnpm 9.15.4',
        framework: 'Next.js 15 (App Router) + React 19',
        language: 'TypeScript (strict)',
        styling: 'Tailwind CSS v4 + shadcn/ui (Radix)',
        ai: 'Vercel AI SDK v5',
        database: 'PostgreSQL (Supabase) + pgvector + Drizzle ORM',
        charts: 'TradingView lightweight-charts v5',
        monorepo: 'Turborepo 2',
        auth: 'NextAuth.js v5 (Credentials, JWT)',
      },
    },
    packages,
    nodes,
    edges,
    views: VIEWS,
    analysis,
    gitHistory,
    evolutionTimeline,
    smartSummaries,
    recommendations,
    pluginHooks,
  };
}
