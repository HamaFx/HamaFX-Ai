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

// Structured logger for the worker. Delegates to the shared pino logger so
// web + worker emit a single, consistent log format with categories,
// redaction, and trace correlation.
//
// The legacy custom logger's API is preserved:
//   - createLogger(opts) returns a Logger
//   - .with(tags) returns a child logger
//   - forceJson option forces JSON output in tests

import { Writable } from 'node:stream';

import {
  createCategorizedLogger,
  type CategorizedLogger,
  type LogCategory,
} from '@hamafx/shared/logger';

export interface Logger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
  /** Returns a child logger that merges `tags` into every line. */
  with(tags: Record<string, unknown>): Logger;
}

export interface LoggerOptions {
  /** 'worker' | 'worker:signalr' | 'worker:job:embedding-backfill' | … */
  service: string;
  /** Commit SHA of the running build — surfaced on every line. */
  commit?: string;
  /** Force JSON output even in NODE_ENV=development (used by tests). */
  forceJson?: boolean;
  /** Optional Writable destination for tests. */
  destination?: Writable;
}

class WorkerLogger implements Logger {
  private readonly logger: CategorizedLogger;
  private readonly destination: Writable | undefined;
  private readonly context: Record<string, unknown>;

  constructor(category: LogCategory, context: Record<string, unknown>, destination?: Writable) {
    this.logger = createCategorizedLogger(category, context, destination);
    this.destination = destination;
    this.context = context;
  }

  info(msg: string, meta?: Record<string, unknown>): void {
    this.logger.info(msg, meta);
  }

  warn(msg: string, meta?: Record<string, unknown>): void {
    this.logger.warn(msg, meta);
  }

  error(msg: string, meta?: Record<string, unknown>): void {
    this.logger.error(msg, meta);
  }

  with(tags: Record<string, unknown>): Logger {
    return new WorkerLogger('worker', { ...this.context, ...tags }, this.destination);
  }
}

function serviceToCategory(service: string): LogCategory {
  if (service.startsWith('worker:job')) return 'worker';
  return 'worker';
}

export function createLogger(opts: LoggerOptions): Logger {
  const category = serviceToCategory(opts.service);
  const context: Record<string, unknown> = { service: opts.service };
  if (opts.commit) context['commit'] = opts.commit;
  if (opts.forceJson) context['forceJson'] = opts.forceJson;
  return new WorkerLogger(category, context, opts.destination);
}
