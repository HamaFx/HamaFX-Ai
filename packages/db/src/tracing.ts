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

// PF-21 — Lightweight OpenTelemetry tracing instrumentation for the query
// layer.
//
// Wraps query helpers with basic span creation and error recording.
// Uses the OpenTelemetry API directly (already a dependency via Langfuse)
// so there's no added bundle cost.
//
// Usage:
//   import { traceQuery } from '../tracing';
//   const result = await traceQuery('queries.threads.getThread', () => db.select()...);

import { trace, SpanStatusCode, type Span } from '@opentelemetry/api';

const TRACER_NAME = 'hamafx-db';

/**
 * Wraps a query function with OpenTelemetry tracing.
 * Creates a span named `query.${name}`, records duration, and captures
 * errors when the query throws.
 *
 * @param name  Descriptive name for the span (e.g. "queries.threads.list").
 * @param fn    The actual query function to trace.
 * @returns     The return value of `fn`.
 */
export async function traceQuery<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const tracer = trace.getTracer(TRACER_NAME);
  return tracer.startActiveSpan(`query.${name}`, async (span: Span) => {
    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      });
      span.recordException(err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      span.end();
    }
  });
}

/**
 * Higher-order function that wraps a query helper with tracing.
 * The resulting function has the same signature as the original.
 *
 * @example
 * ```ts
 * const getThreadTraced = withTracing('queries.threads.getThread', getThread);
 * ```
 */
export function withTracing<A extends unknown[], R>(
  name: string,
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args: A): Promise<R> => {
    return traceQuery(name, () => fn(...args));
  };
}
