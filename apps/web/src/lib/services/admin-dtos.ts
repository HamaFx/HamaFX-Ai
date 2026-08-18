// SPDX-License-Identifier: Apache-2.0

// Shared admin DTO contracts.
//
// Keep these types here so the server route and the client component cannot
// drift. Each type should mirror the JSON returned by its `/api/admin/*`
// namesake endpoint.

// ── Health / SLI ───────────────────────────────────────────────────────────

export interface SliSnapshot {
  /** e.g. "chat_api", "ai_gateway" */
  key: string;
  /** Human-readable label */
  label: string;
  /** Current success rate (0–1) */
  current: number | null;
  /** SLO target success rate (0–1) */
  sloTarget: number;
  /** Measurement scope, such as "current" or "24h". */
  window: string;
  /** Numerator: successful events */
  success: number;
  /** Denominator: total events */
  total: number;
  /** Error budget remaining (0–1); null if no events or not measurable */
  errorBudget: number | null;
  /** When true, the SLI is informational only — no automated measurement */
  informational?: boolean;
  /** Additional context shown below the gauge */
  details?: string;
}

export interface HealthSloResponse {
  ts: string;
  /** DB check latency in ms */
  dbLatencyMs: number;
  /** Whether the DB is reachable */
  dbOk: boolean;
  /** Overall system health based on all SLIs */
  overall: 'healthy' | 'degraded' | 'unhealthy';
  /** Whether Langfuse tracing is active */
  langfuseActive: boolean;
  /** Langfuse base URL (server-populated, safe to expose to admin UI) */
  langfuseBaseUrl: string | null;
  /** Per-service SLI snapshots */
  slis: SliSnapshot[];
  /** Anomalies: unavailable/stuck activity, stale analysis jobs, stale ticks */
  anomalies: string[];
}

// Alias used by the UI component for the response as a whole.
export type HealthSloData = HealthSloResponse;

// ── Users ───────────────────────────────────────────────────────────────────

export interface UserSummary {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
  onboardingCompleted: boolean | null;
}

export interface UserListDTO {
  users: UserSummary[];
  total: number;
}

// ── Cron ───────────────────────────────────────────────────────────────────

export interface CronRun {
  id: string;
  jobName: string;
  status: 'started' | 'done' | 'error';
  note: string | null;
  startedAt: string;
  finishedAt: string | null;
}

// ── Tool telemetry ───────────────────────────────────────────────────────────

export interface ToolTelemetryRow {
  id: string;
  threadId: string;
  tool: string;
  ms: number;
  ok: boolean;
  errorCode: string | null;
  createdAt: string;
}

// ── Diagnostic traces ─────────────────────────────────────────────────────

export interface DiagnosticTraceSummary {
  id: string;
  threadId: string;
  userId: string;
  startedAt: string;
  stepCount: number;
  errorCount: number;
}

export interface DiagnosticTraceStep {
  name: string;
  status: 'started' | 'completed' | 'failed';
  durationMs?: number;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface DiagnosticTraceError {
  message: string;
  name: string;
  stack?: string;
  timestamp: number;
}

export interface DiagnosticTraceDetail extends DiagnosticTraceSummary {
  status: 'completed' | 'failed';
  durationMs: number | null;
  summary: string | null;
  steps: DiagnosticTraceStep[];
  errors: DiagnosticTraceError[];
  metadata?: Record<string, unknown> | null;
}

export type TraceExplorerSource =
  | 'trace'
  | 'turn'
  | 'tool'
  | 'agent'
  | 'analysis-job'
  | 'budget'
  | 'outbox';

export interface TraceExplorerEvent {
  id: string;
  source: TraceExplorerSource;
  timestamp: string;
  name: string;
  status: string;
  traceId: string | null;
  runId: string | null;
  jobId: string | null;
  threadId: string | null;
  messageId: string | null;
  userId: string | null;
  durationMs: number | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
}

export interface TraceExplorerResponse {
  events: TraceExplorerEvent[];
  stats: {
    total: number;
    bySource: Record<string, number>;
    failures: number;
  };
}

// ── Onboarding ───────────────────────────────────────────────────────────────

export interface OnboardingInspectDTO {
  userId: string;
  onboardingCompleted: boolean;
  onboardingProgress: Record<string, unknown> | null;
  userSettings: {
    defaultSymbol: string;
    timezone: string;
    language: string;
  };
  watchlist: string[];
  hasApiKeys: boolean;
  apiProviders: string[];
}

// ── Feature flags ──────────────────────────────────────────────────────────

export interface FeatureFlagsDTO {
  features: Record<string, boolean>;
}

// ── AI shadow comparison ────────────────────────────────────────────────────

export interface AiShadowComparisonDTO {
  id: string;
  threadId: string;
  promptSha256: string;
  primaryAgent: 'mastra' | 'legacy';
  outcome: 'completed' | 'failed';
  failureReason: string | null;
  legacyChars: number | null;
  mastraChars: number | null;
  sharedTokenRatio: number | null;
  overlap: 'none' | 'low' | 'medium' | 'high' | null;
  mastraVerified: boolean | null;
  mastraBias: string | null;
  mastraDataQuality: string | null;
  primaryLatencyMs: number | null;
  shadowLatencyMs: number | null;
  primaryCostUsd: number | null;
  shadowCostUsd: number | null;
  createdAt: string;
}

export interface AiShadowComparisonSummaryDTO {
  total: number;
  completed: number;
  failed: number;
  mastraPrimary: number;
  legacyPrimary: number;
  verifiedReports: number;
  averageSharedTokenRatio: number | null;
  averagePrimaryLatencyMs: number | null;
  averageShadowLatencyMs: number | null;
  averagePrimaryCostUsd: number | null;
  averageShadowCostUsd: number | null;
  overlapCounts: Record<'none' | 'low' | 'medium' | 'high', number>;
  failureReasons: Record<string, number>;
}
