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

import { AsyncLocalStorage } from 'node:async_hooks';
import { Writable } from 'node:stream';
import pino from 'pino';

import { findErrorPattern } from './error-patterns';
import { logStreamHub } from './log-stream';

// Define a default base config for our structured logger
const isDevelopment = process.env.NODE_ENV === 'development';

// NOTE: We intentionally avoid pino-pretty / transport here because
// Next.js webpack/Turbopack cannot safely bundle thread-stream's worker
// file ("vendor-chunks/lib/worker.js"). For pretty-printed dev logs,
// pipe the output: pnpm dev | npx pino-pretty

export const LOG_CATEGORIES = [
  'auth',
  'db',
  'ai',
  'cron',
  'onboarding',
  'billing',
  'api',
  'worker',
  'cache',
  'market_data',
  'telegram',
  'email',
  'push',
  'admin',
  'system',
] as const;

export type LogCategory = (typeof LOG_CATEGORIES)[number];

// AsyncLocalStorage for trace correlation. The diagnostic context sets
// this value so every log line inside a diagnostic scope automatically
// includes the traceId without manual passing.
export const traceIdStorage = new AsyncLocalStorage<string>();

/** Custom pino destination that forwards log lines to stdout and the log stream hub. */
class TeeDestination extends Writable {
  private streamingEnabled: boolean;

  constructor() {
    super();
    this.streamingEnabled = logStreamHub.isEnabled();
  }

  override _write(chunk: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    const line = typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk);
    process.stdout.write(line, (err) => {
      if (this.streamingEnabled) {
        logStreamHub.write(line.trimEnd());
      }
      callback(err ?? undefined);
    });
  }
}

function buildPinoOptions() {
  return {
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
    // Automatically inject default context bindings, but omit pid/hostname to save bytes in JSON
    ...(isDevelopment ? { base: null } : {}),
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'password',
        'hashedPassword',
        'email',
        'token',
        'keys',
        'aiApiKeys',
        // Expanded redaction
        '*.password',
        '*.hashedPassword',
        '*.token',
        '*.secret',
        '*.apiKey',
        '*.apiKeys',
        '*.aiApiKeys',
        '*.privateKey',
        '*.authorization',
        '*.cookie',
        '*.sessionToken',
        '*.refreshToken',
        '*.accessToken',
        '*.clientSecret',
        '*.webhook',
        '*.encryptionKey',
        'error.context.apiKey',
        'error.context.token',
        'error.context.secret',
        'error.context.authorization',
      ],
      censor: '[REDACTED]',
    },
  };
}

export const logger = pino(buildPinoOptions(), new TeeDestination());

/** Create a fresh pino instance wired to the given Writable destination. */
export function createPinoLogger(destination: Writable): pino.Logger {
  return pino(buildPinoOptions(), destination);
}

/**
 * Creates a child logger with scoped context.
 * Useful for attaching `userId` or `threadId` to all subsequent logs in a flow.
 */
export function createScopedLogger(context: Record<string, unknown>) {
  return logger.child(context);
}

/** Get the current traceId from AsyncLocalStorage, if any. */
function getCurrentTraceId(): string | undefined {
  return traceIdStorage.getStore();
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
  // Fallback for stacks without parentheses
  const fallback = stack.split('\n')[1]?.match(/at\s+(.+):(\d+):\d+/);
  if (fallback && fallback[1] && fallback[2]) {
    const file = fallback[1];
    const line = Number(fallback[2]);
    return { file, line };
  }
  return {};
}

/** Build a structured error object for logging. */
function buildErrorObject(err: unknown): Record<string, unknown> {
  const errorObj = err as {
    message?: string;
    name?: string;
    code?: string;
    stack?: string;
    cause?: unknown;
  };
  const stackInfo = parseStack(errorObj?.stack);
  const error: Record<string, unknown> = {
    name: errorObj?.name ?? 'Error',
    message: errorObj?.message ?? String(err),
  };
  if (errorObj?.code) error['code'] = errorObj.code;
  if (errorObj?.stack) error['stack'] = errorObj.stack.slice(0, 2000);
  if (stackInfo.file !== undefined) error['file'] = stackInfo.file;
  if (stackInfo.line !== undefined) error['line'] = stackInfo.line;
  if (errorObj?.cause) {
    error['cause'] = String(errorObj.cause).slice(0, 500);
  }
  return error;
}

/**
 * Log a structured error with context. Automatically enriches the log line
 * with error pattern metadata (suggestedFix, relatedFiles, retryable) and
 * the current traceId if inside a diagnostic scope.
 */
export function logErrorContext(
  err: unknown,
  operation: string,
  context: Record<string, unknown> = {},
  category: LogCategory = 'system',
): void {
  const traceId = getCurrentTraceId();
  const pattern = findErrorPattern(err);
  const error = buildErrorObject(err);

  logger.error(
    {
      category,
      operation,
      ...(traceId ? { traceId } : {}),
      error,
      ...context,
      ...(pattern
        ? {
            suggestedFix: pattern.suggestedFix,
            relatedFiles: pattern.relatedFiles,
            retryable: pattern.retryable,
            errorPattern: pattern.description,
          }
        : {}),
    },
    `${operation} failed`,
  );
}

/** Log method overloads: string-first or pino-style object-first. */
export interface CategorizedLogger {
  trace(msg: string, meta?: Record<string, unknown>): void;
  trace(obj: Record<string, unknown>, msg: string): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
  debug(obj: Record<string, unknown>, msg: string): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  info(obj: Record<string, unknown>, msg: string): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  error(obj: Record<string, unknown>, msg: string): void;
  errorContext: (err: unknown, operation: string, ctx?: Record<string, unknown>) => void;
}

/**
 * Create a categorized logger that automatically injects the `category`
 * field and the current `traceId` (if inside a diagnostic scope) into
 * every log line.
 */
export function createCategorizedLogger(
  category: LogCategory,
  additionalContext: Record<string, unknown> = {},
  destination?: Writable,
): CategorizedLogger {
  const base = destination ? createPinoLogger(destination) : logger;
  const child = base.child({ category, ...additionalContext });

  function log(
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error',
    msgOrObj: string | Record<string, unknown>,
    metaOrMsg?: Record<string, unknown> | string,
  ): void {
    const traceId = getCurrentTraceId();
    const traceMeta = traceId ? { traceId } : {};

    if (typeof msgOrObj === 'string') {
      // string-first: log.info('msg', { meta })
      const meta = typeof metaOrMsg === 'object' && metaOrMsg !== null ? metaOrMsg : undefined;
      child[level]({ ...traceMeta, ...(meta ?? {}) }, msgOrObj);
    } else {
      // object-first: log.info({ meta }, 'msg')
      const msg = typeof metaOrMsg === 'string' ? metaOrMsg : '';
      child[level]({ ...traceMeta, ...msgOrObj }, msg);
    }
  }

  return {
    trace: (msgOrObj: string | Record<string, unknown>, metaOrMsg?: Record<string, unknown> | string) =>
      log('trace', msgOrObj, metaOrMsg),
    debug: (msgOrObj: string | Record<string, unknown>, metaOrMsg?: Record<string, unknown> | string) =>
      log('debug', msgOrObj, metaOrMsg),
    info: (msgOrObj: string | Record<string, unknown>, metaOrMsg?: Record<string, unknown> | string) =>
      log('info', msgOrObj, metaOrMsg),
    warn: (msgOrObj: string | Record<string, unknown>, metaOrMsg?: Record<string, unknown> | string) =>
      log('warn', msgOrObj, metaOrMsg),
    error: (msgOrObj: string | Record<string, unknown>, metaOrMsg?: Record<string, unknown> | string) =>
      log('error', msgOrObj, metaOrMsg),
    errorContext: (err, operation, ctx = {}) => {
      logErrorContext(err, operation, ctx, category);
    },
  };
}

/** Shape of data passed to logForAgent. */
export interface AgentLogData {
  error?: unknown;
  module: string;
  category: LogCategory;
  context?: Record<string, unknown>;
  suggestedFix?: string;
  relatedFiles?: string[];
}

/**
 * Produce a log line specifically formatted for AI agent consumption.
 * The resulting log line has `agentLog: true` so agents can filter with
 * `grep '"agentLog":true'`.
 */
export function logForAgent(
  level: 'error' | 'warn' | 'info',
  operation: string,
  data: AgentLogData,
): void {
  const traceId = getCurrentTraceId();
  const report = data.error
    ? generateBugReport(data.error, {
        operation,
        module: data.module,
        trace: traceId ? { traceId } : null,
      })
    : null;

  logger[level](
    {
      agentLog: true,
      operation,
      module: data.module,
      category: data.category,
      ...(traceId ? { traceId } : {}),
      ...(report ? { bugReport: report } : {}),
      ...(data.context ?? {}),
      ...(data.suggestedFix ? { suggestedFix: data.suggestedFix } : {}),
      ...(data.relatedFiles ? { relatedFiles: data.relatedFiles } : {}),
    },
    operation,
  );
}

// Import here to avoid circular dependency issues at module top level.
import { generateBugReport } from './bug-report';
