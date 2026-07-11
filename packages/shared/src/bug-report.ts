/**
 * Copyright 2026 HamaFX
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
        steps: Array.isArray(options.trace.steps) ? (options.trace.steps as DiagnosticStep[]) : [],
        errors: Array.isArray(options.trace.errors)
          ? (options.trace.errors as DiagnosticError[])
          : [],
      }
    : undefined;

  const relatedFiles = extractRelatedFiles(errorObj.stack);

  const error: BugReport['error'] = {
    name: errorObj.name,
    message: errorObj.message,
    code: appError?.code ?? 'INTERNAL',
    stack: errorObj.stack ?? '',
  };
  if (stackInfo.file) error.file = stackInfo.file;
  if (stackInfo.line) error.line = stackInfo.line;
  if (errorObj.cause) error.cause = String(errorObj.cause).slice(0, 500);

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
