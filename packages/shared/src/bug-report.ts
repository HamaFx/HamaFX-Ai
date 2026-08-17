/**
 * Copyright 2026 Kestrel
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { AppError } from './errors';

const PRIVATE_CONTENT_KEY_PATTERN =
  /^(?:prompt|content|text|input|output|args|parts|messages|response|query|snippet|body)$/i;
const SENSITIVE_KEY_PATTERN =
  /api[_-]?key|access[_-]?token|auth[_-]?token|token|secret|password|passwd|cookie|webhook|private[_-]?key|client[_-]?secret|refresh[_-]?token/i;
const SECRET_STRING_PATTERNS: Array<[RegExp, string]> = [
  [/(?:authorization)\s*[:=]\s*(?:(?:Bearer|Basic|Token)\s+)?[^\s,&;]+/gi, 'authorization=<redacted>'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer <redacted>'],
  [/\b(?:api[_-]?key|access[_-]?token|token|secret|password|cookie)\s*[=:]\s*[^\s,&;]+/gi, '<redacted-secret>'],
];

/**
 * Redact private content before a payload is sent to logs, Sentry, or an
 * agent-facing bug report. This is deliberately exported from the shared
 * package so every observability sink can use the same boundary policy.
 */
export function redactDiagnosticPayload(value: unknown): unknown {
  if (typeof value === 'string') {
    return SECRET_STRING_PATTERNS.reduce(
      (result, [pattern, replacement]) => result.replace(pattern, replacement),
      value,
    );
  }
  if (Array.isArray(value)) return value.map(redactDiagnosticPayload);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? '<redacted>'
        : PRIVATE_CONTENT_KEY_PATTERN.test(key)
          ? '<redacted-content>'
          : redactDiagnosticPayload(child);
    }
    return out;
  }
  return value;
}

export interface DiagnosticStep {
  name: string;
  status: 'started' | 'completed' | 'failed';
  durationMs?: number;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface DiagnosticError {
  message: string;
  name: string;
  stack?: string;
  timestamp: number;
}

export interface DiagnosticTrace {
  traceId: string;
  userId: string;
  threadId: string;
  durationMs: number;
  steps: DiagnosticStep[];
  errors: DiagnosticError[];
}

export interface BugReport {
  // Unique identifier for this bug report
  reportId: string;
  // ISO timestamp
  timestamp: string;
  // The error that triggered the report
  error: {
    name: string;
    message: string;
    code: string;
    stack: string;
    file?: string;
    line?: number;
    cause?: string;
  };
  // The operation that failed
  operation: string;
  // The module/feature
  module: string;
  // Whether the error is retryable
  retryable: boolean;
  // Diagnostic trace (if available)
  trace?: DiagnosticTrace;
  // Environment context
  environment: {
    nodeEnv: string;
    deployedSha: string;
    runtime: string;
  };
  // Request context (if available)
  request?: {
    requestId: string;
    route: string;
    method: string;
  };
  // User context (if available)
  user?: {
    userId: string;
    // Never include email or PII
  };
  // Suggested fix (if available)
  suggestedFix?: string;
  // Related files (parsed from stack trace)
  relatedFiles: string[];
  // Log lines surrounding the error (if available)
  surroundingLogs?: string[];
}

/** Best-effort parse of file/line from a stack trace. */
function parseStack(stack: string | undefined): { file?: string; line?: number } {
  if (!stack) return {};
  const match = stack.split('\n')[1]?.match(/\((.+):(\d+):\d+\)/);
  if (match && match[1] && match[2]) {
    const file = match[1];
    const line = Number(match[2]);
    return { file, line };
  }
  const fallback = stack.split('\n')[1]?.match(/at\s+(.+):(\d+):\d+/);
  if (fallback && fallback[1] && fallback[2]) {
    const file = fallback[1];
    const line = Number(fallback[2]);
    return { file, line };
  }
  return {};
}

/** Extract file paths from a stack trace. */
function extractRelatedFiles(stack: string | undefined): string[] {
  if (!stack) return [];
  const files = new Set<string>();
  const regex = /\(([^)]+):\d+:\d+\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(stack)) !== null) {
    const file = match[1];
    if (file && !file.includes('node_modules')) {
      files.add(file);
    }
  }
  return Array.from(files);
}

/** Generate a unique report ID. */
function generateReportId(): string {
  return `br_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface BugReportOptions {
  operation: string;
  module: string;
  trace?: Record<string, unknown> | null;
  requestId?: string;
  route?: string;
  method?: string;
  userId?: string;
  suggestedFix?: string;
}

/**
 * Generate a structured bug report from an error. Designed to be consumed
 * by AI coding agents — it includes the error, stack, context, and
 * suggested fixes without exposing PII.
 */
export function generateBugReport(err: unknown, options: BugReportOptions): BugReport {
  const errorObj = err instanceof Error ? err : new Error(String(err));
  const stackInfo = parseStack(errorObj.stack);
  const appError = err instanceof AppError ? err : null;

  const trace: DiagnosticTrace | undefined = options.trace
    ? {
        traceId: String(options.trace.traceId ?? ''),
        userId: String(options.trace.userId ?? ''),
        threadId: String(options.trace.threadId ?? ''),
        durationMs: Number(options.trace.durationMs ?? 0),
        steps: Array.isArray(options.trace.steps)
          ? (redactDiagnosticPayload(options.trace.steps) as DiagnosticStep[])
          : [],
        errors: Array.isArray(options.trace.errors)
          ? (redactDiagnosticPayload(options.trace.errors) as DiagnosticError[])
          : [],
      }
    : undefined;

  const relatedFiles = extractRelatedFiles(errorObj.stack);

  const error: BugReport['error'] = {
    name: errorObj.name,
    message: redactDiagnosticPayload(errorObj.message) as string,
    code: appError?.code ?? 'INTERNAL',
    stack: redactDiagnosticPayload(errorObj.stack ?? '') as string,
  };
  if (stackInfo.file) error.file = stackInfo.file;
  if (stackInfo.line) error.line = stackInfo.line;
  if (errorObj.cause) {
    error.cause = String(redactDiagnosticPayload(String(errorObj.cause))).slice(0, 500);
  }

  const report: BugReport = {
    reportId: generateReportId(),
    timestamp: new Date().toISOString(),
    error,
    operation: options.operation,
    module: options.module,
    retryable: (appError?.details as { retryable?: boolean } | undefined)?.retryable ?? false,
    ...(trace ? { trace } : {}),
    environment: {
      nodeEnv: process.env.NODE_ENV ?? 'unknown',
      deployedSha: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.DEPLOYED_SHA ?? 'unknown',
      runtime: typeof window === 'undefined' ? 'node' : 'browser',
    },
    ...(options.requestId
      ? {
          request: {
            requestId: options.requestId,
            route: options.route ?? 'unknown',
            method: options.method ?? 'GET',
          },
        }
      : {}),
    ...(options.userId
      ? {
          user: {
            userId: options.userId,
          },
        }
      : {}),
    ...(options.suggestedFix ? { suggestedFix: options.suggestedFix } : {}),
    relatedFiles,
  };

  return report;
}
