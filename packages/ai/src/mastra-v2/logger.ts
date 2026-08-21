// SPDX-License-Identifier: Apache-2.0

/**
 * Mastra logger adapter (Phase 0).
 *
 * Routes Mastra's internal logging into Kestrel's single structured pino
 * stream (`@kestrel/shared/logger`) with the `ai` category and a `mastra`
 * component tag, so Mastra framework logs appear alongside application logs
 * with the same redaction, trace correlation, and log-stream delivery.
 */

import type { IMastraLogger, LogLevel, LoggerTransport, BaseLogMessage } from '@mastra/core/logger';
import { createCategorizedLogger, logErrorContext } from '@kestrel/shared/logger';

/** Mastra's `LogLevel` is a subset of pino's; route both error-ish levels to error. */
function pinoLevel(level: LogLevel | undefined): 'debug' | 'info' | 'warn' | 'error' {
  switch (level) {
    case 'debug':
      return 'debug';
    case 'warn':
      return 'warn';
    case 'error':
      return 'error';
    default:
      return 'info';
  }
}

/**
 * Adapter that forwards Mastra logger calls into the shared categorized pino
 * logger. Mastra's `listLogs`/`listLogsByRunId` surfaces are intentionally
 * empty: Kestrel owns log persistence and streaming (see the admin log
 * stream), so Mastra transports are not registered.
 */
export class MastraPinoLogger implements IMastraLogger {
  private readonly log = createCategorizedLogger('ai', { component: 'mastra' });

  debug(message: string, ...args: unknown[]): void {
    this.log.debug(message, this.argsToMeta(args));
  }

  info(message: string, ...args: unknown[]): void {
    this.log.info(message, this.argsToMeta(args));
  }

  warn(message: string, ...args: unknown[]): void {
    this.log.warn(message, this.argsToMeta(args));
  }

  error(message: string, ...args: unknown[]): void {
    this.log.error(message, this.argsToMeta(args));
  }

  trackException(error: Error, metadata?: Record<string, unknown>): void {
    logErrorContext(error, 'mastra.trackException', metadata ?? {}, 'ai');
  }

  getTransports(): Map<string, LoggerTransport> {
    return new Map();
  }

  async listLogs(
    _transportId: string,
    _params?: {
      fromDate?: Date;
      toDate?: Date;
      logLevel?: LogLevel;
      filters?: Record<string, unknown>;
      page?: number;
      perPage?: number;
    },
  ): Promise<{ logs: BaseLogMessage[]; total: number; page: number; perPage: number; hasMore: boolean }> {
    return { logs: [], total: 0, page: 1, perPage: 50, hasMore: false };
  }

  async listLogsByRunId(_args: {
    transportId: string;
    runId: string;
    fromDate?: Date;
    toDate?: Date;
    logLevel?: LogLevel;
    filters?: Record<string, unknown>;
    page?: number;
    perPage?: number;
  }): Promise<{ logs: BaseLogMessage[]; total: number; page: number; perPage: number; hasMore: boolean }> {
    return { logs: [], total: 0, page: 1, perPage: 50, hasMore: false };
  }

  /** Attach primitive extra args as numbered fields; drop objects (pino handles the first meta arg). */
  private argsToMeta(args: unknown[]): Record<string, unknown> | undefined {
    if (args.length === 0) return undefined;
    const first = args[0];
    if (typeof first === 'object' && first !== null && !Array.isArray(first)) {
      return first as Record<string, unknown>;
    }
    const entries: Array<[string, unknown]> = [];
    for (let index = 0; index < args.length; index += 1) {
      const value = args[index];
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        entries.push([`arg${index}`, value]);
      }
    }
    return entries.length > 0 ? Object.fromEntries(entries) : undefined;
  }
}
