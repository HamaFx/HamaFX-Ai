// SPDX-License-Identifier: Apache-2.0

// AI Knowledge Generator — produces machine-readable artifacts optimized
// for AI agents to understand the project without rediscovering everything.
// Generates: architecture.json, features.json, dependencies.json,
// api.json, database.json, ai.json, flows.json, knowledge.md

import * as fs from 'node:fs';
import * as path from 'node:path';
import { GraphModel } from './graph-model.js';
import type { ArchitectureModel, ParsedFile } from './types.js';
import type { ScannedFile } from './scanner.js';

export interface KnowledgeOutput {
  architecture: object;
  features: object;
  dependencies: object;
  api: object;
  database: object;
  ai: object;
  flows: object;
  markdown: string;
}

export function generateKnowledgeArtifacts(
  model: ArchitectureModel,
  graph: GraphModel,
  parsedFiles: Map<string, ParsedFile>,
): KnowledgeOutput {
  const nodes = graph.getAllNodes();
  const analysis = model.analysis;

  return {
    architecture: generateArchitecture(model, nodes),
    features: generateFeatures(),
    dependencies: generateDependencies(model),
    api: generateApi(parsedFiles),
    database: generateDatabase(nodes),
    ai: generateAi(parsedFiles),
    flows: generateFlows(),
    markdown: generateKnowledgeMarkdown(model, nodes, analysis),
  };
}

// ── architecture.json ──
function generateArchitecture(model: ArchitectureModel, nodes: ReturnType<GraphModel['getAllNodes']>) {
  const pkgs = model.packages.map(p => ({
    name: p.name,
    path: p.path,
    nodeCount: nodes.filter(n => n.pkg === p.name).length,
    dependsOn: p.dependsOn,
  }));

  const layers = [
    { name: 'Presentation', packages: ['@hamafx/web'], responsibility: 'Next.js 15 PWA, React 19 UI, TradingView charts, 96 API routes' },
    { name: 'API Gateway', packages: ['@hamafx/web'], responsibility: 'NextAuth JWT, CSRF, rate limiting, middleware' },
    { name: 'AI Agent', packages: ['@hamafx/ai'], responsibility: 'Chat routing, 32 tools, multi-agent committee, memory, citations' },
    { name: 'Data', packages: ['@hamafx/data'], responsibility: 'Provider failover, caching (SWR), throttling, BiQuote→Finnhub' },
    { name: 'Persistence', packages: ['@hamafx/db'], responsibility: 'Drizzle ORM, 48+ tables, Postgres + PGlite' },
    { name: 'Indicators', packages: ['@hamafx/indicators'], responsibility: 'SMA, EMA, RSI, MACD, Bollinger, SMC concepts' },
    { name: 'Worker', packages: ['@hamafx/worker'], responsibility: 'SignalR consumer, TickBuffer, Candle1mAggregator, 7+ cron jobs' },
    { name: 'Shared', packages: ['@hamafx/shared'], responsibility: 'Zod schemas, types, env validation, encryption, logging, DI container' },
    { name: 'Infrastructure', packages: ['infra', 'docker'], responsibility: 'Vercel (web), GCE VM (worker), Docker Compose, systemd' },
  ];

  const keyPatterns = [
    { name: 'Provider Failover', location: 'packages/data/src/failover.ts', description: 'Health-aware provider ordering with pinned providers, quota-aware error ranking via runWithFailover()' },
    { name: 'SWR (Stale-While-Revalidate)', location: 'packages/data/src/cache/', description: 'Cache serves stale data while refreshing in background' },
    { name: 'Atomic Budget Guard', location: 'packages/ai/src/budget-guard.ts', description: 'Single INSERT..ON CONFLICT DO UPDATE WHERE total+candidate <= cap for concurrent safety' },
    { name: 'Plan-Then-Act', location: 'packages/ai/src/planner.ts', description: 'Cheap model generates JSON plan before expensive model runs tools' },
    { name: 'Citation Enforcement', location: 'packages/ai/src/verification.ts', description: 'Scans assistant turns for unsupported claims, appends warning if found' },
    { name: 'Plugin Registry', location: 'packages/ai/src/tools/registry.ts', description: 'Self-registering tools via singleton ToolRegistry with per-plan gating' },
    { name: 'DI Container', location: 'packages/shared/src/container.ts', description: 'Injectable db/llmClient for testing (DIP-1)' },
    { name: 'Rolling Thread Summary', location: 'packages/ai/src/memory/thread-summary.ts', description: 'Compacts older messages into system prompt when context window fills' },
  ];

  return {
    schema_version: '1.0',
    generated_at: model.generatedAt,
    project: model.project,
    dependency_chain: 'config → shared → db + indicators → data → ai → web + worker',
    package_count: pkgs.length,
    packages: pkgs,
    architecture_layers: layers,
    key_design_patterns: keyPatterns,
    external_integrations: [
      { name: 'BiQuote', type: 'Market Data', protocol: 'SignalR', role: 'Primary live ticks' },
      { name: 'Binance', type: 'Market Data', protocol: 'WebSocket', role: 'Crypto klines' },
      { name: 'Finnhub', type: 'Market Data', protocol: 'REST', role: 'Fallback provider' },
      { name: 'Supabase', type: 'Database', protocol: 'PostgreSQL', role: 'Primary DB hosting' },
      { name: 'Vercel', type: 'Hosting', protocol: 'HTTP', role: 'Web application hosting' },
      { name: 'GCE VM', type: 'Hosting', protocol: 'SSH', role: 'Worker daemon hosting' },
      { name: 'Google Vertex AI', type: 'AI', protocol: 'API', role: 'Default AI model provider' },
      { name: 'Sentry', type: 'Monitoring', protocol: 'API', role: 'Error tracking' },
      { name: 'Langfuse', type: 'Observability', protocol: 'API', role: 'LLM tracing' },
      { name: 'NOWPayments', type: 'Billing', protocol: 'REST', role: 'Crypto payments' },
      { name: 'Telegram', type: 'Bot', protocol: 'Webhook', role: 'Bot platform' },
    ],
    byok_providers: ['google', 'anthropic', 'openai', 'groq', 'deepseek', 'xai', 'openrouter', 'github', 'cerebras'],
  };
}

// ── features.json ──
function generateFeatures() {
  const features = [
    { name: 'AI Chat (Single-Agent)', package: '@hamafx/ai', modules: ['agent.ts', 'routing.ts', 'planner.ts', 'verification.ts', 'chat-retry-loop.ts'], description: 'Streaming chat with domain-based routing, plan-then-act, 32 tools, 5-attempt retry' },
    { name: 'Multi-Agent Committee', package: '@hamafx/ai', modules: ['multi-agent/orchestrator.ts', 'multi-agent/agents/'], description: '4 specialist agents + 1 decision agent with token-by-token fusion streaming' },
    { name: 'Live Market Data', package: '@hamafx/data', modules: ['adapters/price.ts', 'adapters/candles.ts', 'failover.ts', 'cache/'], description: 'BiQuote SignalR → TickBuffer → live_ticks with Finnhub REST fallback' },
    { name: 'Technical Indicators', package: '@hamafx/indicators', modules: ['moving-averages.ts', 'rsi.ts', 'macd.ts', 'bollinger.ts', 'smc/'], description: 'SMA, EMA, RSI, MACD, Bollinger Bands, SMC (FVG, order blocks, liquidity, swings, BOS/CHoCH)' },
    { name: 'Alert Engine', package: '@hamafx/ai', modules: ['alerts/evaluator.ts', 'alerts/delivery.ts', 'alerts/persistence.ts'], description: 'Rule evaluation, delivery (email/push/telegram), snooze, simulation' },
    { name: 'Trading Journal', package: '@hamafx/ai', modules: ['journal/persistence.ts', 'journal/review.ts'], description: 'Trade logging, R-multiple computation, AI-powered trade review' },
    { name: 'Portfolio Management', package: '@hamafx/ai', modules: ['portfolio/'], description: 'Position tracking, PnL computation, risk reporting' },
    { name: 'Background Jobs', package: '@hamafx/worker', modules: ['scheduler.ts', 'jobs/'], description: '7+ cron jobs: briefings, snapshots, COT, weekly review, embedding backfill, candle flush' },
    { name: 'Push Notifications', package: '@hamafx/ai', modules: ['push/send.ts', 'push/persistence.ts'], description: 'Web Push API with VAPID, subscription management' },
    { name: 'Bot Platform', package: '@hamafx/ai', modules: ['bot/', 'telegram/'], description: 'Telegram bot with commands, link codes, idempotency, rate limiting' },
    { name: 'BYOK Provider Registry', package: '@hamafx/ai', modules: ['byok-providers.ts', '_providers/'], description: '9 AI providers with Bring-Your-Own-Key support, fallback chain, model catalog' },
    { name: 'Social Sentiment', package: '@hamafx/ai', modules: ['sentiment/'], description: 'Social media sentiment integration for contrarian signals' },
  ];

  return {
    schema_version: '1.0',
    feature_count: features.length,
    features,
  };
}

// ── dependencies.json ──
function generateDependencies(model: ArchitectureModel) {
  return {
    schema_version: '1.0',
    packages: model.packages.map(p => ({
      name: p.name,
      depends_on: p.dependsOn,
      depended_by: model.packages.filter(op => op.dependsOn.includes(p.name)).map(op => op.name),
    })),
  };
}

// ── api.json ──
function generateApi(parsedFiles: Map<string, ParsedFile>) {
  const routes = [];
  for (const [, parsed] of parsedFiles) {
    if (!parsed.isApiRoute || !parsed.routePath) continue;
    routes.push({
      methods: (parsed.httpMethod || 'GET').split(',').map(m => m.trim()).filter(Boolean),
      path: parsed.routePath,
      handler: parsed.relativePath,
      package: parsed.pkg,
      exports: parsed.exports.map(e => e.name),
    });
  }

  // Group by domain
  const byDomain: Record<string, typeof routes> = {};
  for (const r of routes) {
    const domain = r.path.split('/')[2] || 'root';
    if (!byDomain[domain]) byDomain[domain] = [];
    byDomain[domain]!.push(r);
  }

  return {
    schema_version: '1.0',
    total_routes: routes.length,
    routes,
    routes_by_domain: byDomain,
  };
}

// ── database.json ──
function generateDatabase(nodes: ReturnType<GraphModel['getAllNodes']>) {
  const tables = nodes.filter(n => n.type === 'table').map(n => ({
    name: n.name,
    columns: (n.metadata as { columns?: string[] }).columns || [],
    schema_file: n.path,
    package: n.pkg,
  }));

  const byFile: Record<string, typeof tables> = {};
  for (const t of tables) {
    if (!byFile[t.schema_file]) byFile[t.schema_file] = [];
    byFile[t.schema_file]!.push(t);
  }

  return {
    schema_version: '1.0',
    total_tables: tables.length,
    tables,
    tables_by_schema_file: byFile,
  };
}

// ── ai.json ──
function generateAi(parsedFiles: Map<string, ParsedFile>) {
  const tools = [];
  const agents = [];

  for (const [, parsed] of parsedFiles) {
    if (parsed.isAiTool && parsed.toolName) {
      tools.push({
        name: parsed.toolName,
        description: parsed.toolDescription || '(no description)',
        file: parsed.relativePath,
      });
    }
    if (parsed.isAgent && parsed.agentName) {
      agents.push({
        name: parsed.agentName,
        file: parsed.relativePath,
        extendedFrom: parsed.classes.find(c => c.extendsName)?.extendsName || null,
      });
    }
  }

  const routingDomains = ['fundamental', 'technical', 'summary', 'vision', 'generic'];
  const analysisModes = ['single', 'quick', 'standard', 'full', 'auto'];
  const modelTiers = ['fast', 'mid', 'strong'];

  return {
    schema_version: '1.0',
    tool_count: tools.length,
    tools,
    agent_count: agents.length,
    agents,
    routing: {
      domains: routingDomains,
      description: 'Domain-based turn classification: keyword scoring + optional semantic routing via LLM',
    },
    multi_agent: {
      modes: analysisModes,
      description: 'Single-agent, quick (1 specialist), standard (2), full (4, queued to worker), auto-detect',
      specialists: ['technical', 'fundamental', 'risk', 'sentiment'],
      synthesizer: 'decision',
    },
    model_tiers: modelTiers,
    byok_providers: ['google', 'anthropic', 'openai', 'groq', 'deepseek', 'xai', 'openrouter', 'github', 'cerebras'],
  };
}

// ── flows.json ──
function generateFlows() {
  return {
    schema_version: '1.0',
    flows: [
      {
        name: 'AI Chat Pipeline',
        steps: [
          { order: 1, step: 'User sends message', component: '/api/chat route handler' },
          { order: 2, step: 'Rate limit check', component: 'withRateLimit()' },
          { order: 3, step: 'Thread ownership verification', component: 'getThread()' },
          { order: 4, step: 'Budget guardrail', component: 'tryReserveBudget() — atomic INSERT ON CONFLICT' },
          { order: 5, step: 'Persist user message', component: 'appendUserMessage()' },
          { order: 6, step: 'Load history + live snapshot', component: 'listMessages() + buildLiveSnapshot()' },
          { order: 7, step: 'Thread compaction', component: 'compactThread() — rolling summary' },
          { order: 8, step: 'Domain routing', component: 'routeTurn() — keyword scoring + optional semantic' },
          { order: 9, step: 'Model resolution', component: 'resolveChatModel() — domain→tier mapping' },
          { order: 10, step: 'Planner (if planRequired)', component: 'runPlanner() — cheap model generates JSON plan' },
          { order: 11, step: 'Tool filtering', component: 'domainToolFilter() — per-domain tool set' },
          { order: 12, step: 'Stream with tools', component: 'streamText() — up to 5 retry attempts' },
          { order: 13, step: 'Citation enforcement', component: 'enforceCitations() — post-finish fact-check' },
          { order: 14, step: 'Budget reconciliation', component: 'budget.reconcile() — adjust to actual cost' },
          { order: 15, step: 'Auto-title', component: 'runAutoTitleBackground() — background' },
          { order: 16, step: 'Return stream', component: 'result.toUIMessageStreamResponse()' },
        ],
      },
      {
        name: 'Multi-Agent Committee',
        steps: [
          { order: 1, step: 'Budget guardrail', component: 'tryReserveBudget()' },
          { order: 2, step: 'Persist user message', component: 'appendUserMessage()' },
          { order: 3, step: 'Build shared context', component: 'buildSharedContext() — snapshot + prefetch' },
          { order: 4, step: 'Resolve mode', component: 'resolveMode() — quick/standard/full/auto' },
          { order: 5, step: 'Run specialists in parallel', component: 'TechnicalAgent + FundamentalAgent + RiskAgent + SentimentAgent' },
          { order: 6, step: 'Decision agent fusion', component: 'DecisionAgent.fuse() — token-by-token streaming' },
          { order: 7, step: 'Citation enforcement', component: 'enforceCitations() — delegated from specialists' },
          { order: 8, step: 'Persist message + opinions', component: 'appendAssistantMessage() + saveAgentOpinions()' },
          { order: 9, step: 'Budget reconciliation', component: 'applyBudgetDelta()' },
        ],
      },
      {
        name: 'Worker Tick Processing',
        steps: [
          { order: 1, step: 'SignalR connection', component: 'SignalRConsumer.connect()' },
          { order: 2, step: 'Receive tick', component: 'SignalR message handler' },
          { order: 3, step: 'Buffer tick', component: 'TickBuffer.push() — stores latest per symbol' },
          { order: 4, step: '1Hz flush', component: 'flushLiveTicks() — UPSERT into live_ticks' },
          { order: 5, step: 'Candle aggregation', component: 'Candle1mAggregator — open/high/low/close bar' },
          { order: 6, step: 'Candle close', component: 'flushClosedCandle() — UPSERT into candles_1m' },
        ],
      },
      {
        name: 'Auth Flow',
        steps: [
          { order: 1, step: 'Request enters', component: 'Edge Middleware' },
          { order: 2, step: 'JWT check', component: 'NextAuth JWT strategy' },
          { order: 3, step: 'CSRF validation', component: 'Middleware CSRF check' },
          { order: 4, step: 'signed x-user-id header', component: 'HMAC-SHA256 for defense-in-depth' },
          { order: 5, step: 'Route handler', component: 'withAuth() wrapper' },
          { order: 6, step: 'Session validation', component: 'userSessions table + tokenVersion check' },
          { order: 7, step: 'User scoping', component: 'strict userId scoping on all queries' },
        ],
      },
    ],
  };
}

// ── knowledge.md ──
function generateKnowledgeMarkdown(
  model: ArchitectureModel,
  nodes: ReturnType<GraphModel['getAllNodes']>,
  analysis: ArchitectureModel['analysis'],
): string {
  const pkgCount = model.packages.length;
  const nodeCount = nodes.length;
  const toolNodes = nodes.filter(n => n.type === 'tool');
  const agentNodes = nodes.filter(n => n.type === 'agent');
  const routeNodes = nodes.filter(n => n.type === 'api_route');
  const tableNodes = nodes.filter(n => n.type === 'table');

  return `# HamaFX-Ai Architecture Knowledge Base

> **Auto-generated**: ${model.generatedAt}
> **Schema version**: 1.0
> **Purpose**: AI-agent-optimized architecture overview for rapid project understanding

---

## Project Overview

**HamaFX-Ai** is an open-source (Apache-2.0), multi-tenant, chat-driven AI trading copilot for forex instruments: **XAUUSD** (primary), **EURUSD**, **GBPUSD**.

- **Stack**: Next.js 15 (App Router) + React 19 + TypeScript (strict)
- **AI**: Vercel AI SDK v5, Google Vertex AI + 9-provider BYOK registry
- **Database**: PostgreSQL (Supabase) + pgvector, Drizzle ORM (${tableNodes.length}+ tables)
- **Auth**: NextAuth.js v5 (Credentials provider, JWT strategy)
- **Charts**: TradingView lightweight-charts v5
- **Monorepo**: pnpm workspaces + Turborepo 2

## Monorepo Structure

| Package | Path | Type | Purpose |
|---------|------|------|---------|
${model.packages.map(p => `| **${p.name}** | \`${p.path}\` | ${p.type} | ${p.description} |`).join('\n')}

**Dependency chain**: \`config → shared → db + indicators → data → ai → web + worker\`

**Total**: ${pkgCount} packages, **${nodeCount}** architecture nodes

## Architecture Layers

1. **Presentation** (\`@hamafx/web\`) — Next.js 15 PWA, React 19, Tailwind CSS v4, shadcn/ui, TradingView charts
2. **API Gateway** (\`@hamafx/web\` middleware) — NextAuth JWT, CSRF, rate limiting, ${routeNodes.length} API routes
3. **AI Agent** (\`@hamafx/ai\`) — Chat routing, plan-then-act, ${toolNodes.length} tools, ${agentNodes.length} agents, memory, citations
4. **Data** (\`@hamafx/data\`) — Provider failover, caching (SWR), throttling, BiQuote→Finnhub
5. **Persistence** (\`@hamafx/db\`) — Drizzle ORM, ${tableNodes.length}+ tables, Postgres (Supabase) + PGlite
6. **Worker** (\`@hamafx/worker\`) — SignalR consumer, TickBuffer, Candle1mAggregator, 7+ cron jobs
7. **Infrastructure** — Vercel (web) + GCE VM (worker), Docker Compose, systemd timers

## Key Design Patterns

1. **Provider Failover** — \`runWithFailover()\` with health-aware ordering, pinned providers, quota-aware error ranking
2. **SWR** — Stale-while-revalidate at every layer of the data pipeline
3. **Atomic Budget Guard** — Single \`INSERT..ON CONFLICT DO UPDATE WHERE total+candidate <= cap\`
4. **Plan-Then-Act** — Cheap model generates JSON plan before expensive model runs tools
5. **Citation Enforcement** — Post-finish scan for unsupported claims
6. **Plugin Registry** — Self-registering tools via singleton ToolRegistry with per-plan gating
7. **DI Container** — Injectable db/llmClient for testability
8. **Rolling Thread Summary** — Compacts older messages into system prompt

## AI Agent Architecture

### Single-Agent Pipeline
User Message → Rate Limit → Thread Check → Budget Guard → History Load → Thread Compaction → Domain Routing → Model Resolution → Planner (if needed) → Tool Filtering → streamText (max 5 retries) → Citation Check → Budget Reconcile → Auto-Title

### Multi-Agent Committee
4 specialist agents (Technical, Fundamental, Risk, Sentiment) + 1 Decision synthesizer. Modes: quick (1 agent), standard (2), full (4, queued to worker via analysis_jobs table).

### ${toolNodes.length} AI Tools
${toolNodes.map(t => `- **${t.name}** — ${t.description}`).join('\n')}

### Model Routing
- **Domains**: fundamental, technical, summary, vision, generic
- **Tiers**: fast (technical/sentiment), mid (fundamental/risk), strong (decision)
- **BYOK**: 9 providers (google, anthropic, openai, groq, deepseek, xai, openrouter, github, cerebras)

## API Surface

${routeNodes.length} routes across major domains:
${Object.entries(
  routeNodes.reduce((acc: Record<string, number>, n) => {
    const domain = n.path.split('/')[2] || 'root';
    acc[domain] = (acc[domain] || 0) + 1;
    return acc;
  }, {})
).map(([d, c]) => `- **/${d}**: ${c} endpoints`).join('\n')}

## Database

${tableNodes.length}+ tables in PostgreSQL (Supabase) + pgvector:
${tableNodes.slice(0, 20).map(t => `- **${t.name}** (${((t.metadata as {columns?:string[]}).columns||[]).length} columns)`).join('\n')}
${tableNodes.length > 20 ? `- ... and ${tableNodes.length - 20} more tables` : ''}

## Analysis Summary

${analysis ? `
- **Circular Dependencies**: ${analysis.summary.totalCycles}
- **Architecture Hotspots**: ${analysis.summary.hotspotCount}
- **Dead Code / Orphans**: ${analysis.summary.deadOrOrphanCount}
- **Shared Utilities**: ${analysis.summary.sharedUtilityCount}
- **Average Coupling**: ${analysis.summary.avgCoupling}
- **Max Dependency Chain**: ${analysis.summary.maxChainLength} hops
` : 'Analysis not available.'}

## External Integrations

| Provider | Type | Protocol | Role |
|----------|------|----------|------|
| BiQuote | Market Data | SignalR | Primary live ticks |
| Binance | Market Data | WebSocket | Crypto klines |
| Finnhub | Market Data | REST | Fallback provider |
| Supabase | Database | PostgreSQL | Primary DB hosting |
| Vercel | Hosting | HTTP | Web application |
| GCE VM | Hosting | SSH | Worker daemon |
| Google Vertex AI | AI | API | Default AI model |
| Sentry | Monitoring | API | Error tracking |
| Langfuse | Observability | API | LLM tracing |
| NOWPayments | Billing | REST | Crypto payments |
| Telegram | Bot | Webhook | Bot platform |
`;
}
