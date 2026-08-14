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

// Langfuse + OpenTelemetry instrumentation for the Vercel AI SDK v5.
//
// Import once at process start (Next.js instrumentation and the worker entry
// point). AI SDK telemetry is opt-in per call; `telemetryConfig()` provides
// that call-level setting. This module only owns exporter lifecycle.

import { NodeSDK } from '@opentelemetry/sdk-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { createCategorizedLogger } from '@kestrel/shared/logger';

import { redactSecrets } from './diagnostics/redact';

const llog = createCategorizedLogger('system', { component: 'langfuse' });

type LangfuseService = 'web' | 'worker';

let sdk: NodeSDK | null = null;
let processor: LangfuseSpanProcessor | null = null;
let started = false;
let missingConfigLogged = false;

/**
 * Initialise OpenTelemetry with Langfuse export.
 *
 * The Langfuse processor's `flushInterval` is measured in seconds, not
 * milliseconds. Keep the web and worker defaults short enough for useful
 * debugging while `flushLangfuse()` handles short-lived/request boundaries.
 */
export function initLangfuse(options: { service?: LangfuseService } = {}): void {
  if (started) return;

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASE_URL;
  if (!publicKey || !secretKey || !baseUrl) {
    if (!missingConfigLogged) {
      missingConfigLogged = true;
      llog.info('Langfuse tracing disabled — required LANGFUSE_* variables are not configured');
    }
    return;
  }

  const service = options.service ?? 'worker';
  const release = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.DEPLOYED_SHA;
  const nextProcessor = new LangfuseSpanProcessor({
    publicKey,
    secretKey,
    baseUrl,
    // Langfuse expects seconds here. Do not pass the millisecond values used
    // by browser timers or the exporter may wait for more than an hour.
    flushInterval: 5,
    environment: process.env.NODE_ENV ?? 'development',
    ...(release ? { release } : {}),
    // AI SDK telemetry can contain prompts, tool inputs, and model outputs.
    // Redact object keys and credential-shaped strings before export.
    mask: ({ data }) => redactSecrets(data),
    // Web functions can freeze shortly after a stream completes; forceFlush
    // is called by the request lifecycle. The worker benefits from batching.
    exportMode: 'batched',
  });

  try {
    const nextSdk = new NodeSDK({ spanProcessors: [nextProcessor] });
    nextSdk.start();
    processor = nextProcessor;
    sdk = nextSdk;
    started = true;
    llog.info('OpenTelemetry tracing enabled', {
      baseUrl,
      service,
      flushIntervalSeconds: 5,
    });
  } catch (err) {
    // Tracing must never prevent the application or worker from starting.
    llog.error('OpenTelemetry tracing failed to start', { err: String(err), service });
  }
}

/** Flush pending Langfuse spans without shutting down the process. */
export async function flushLangfuse(): Promise<void> {
  if (!processor) return;
  try {
    await processor.forceFlush();
  } catch (err) {
    llog.warn('Langfuse span flush failed (non-fatal)', { err: String(err) });
  }
}

/** Gracefully flush and stop the exporter during process shutdown. */
export async function shutdownLangfuse(): Promise<void> {
  if (!sdk) return;
  try {
    await sdk.shutdown();
    llog.info('tracing shut down cleanly');
  } catch (err) {
    llog.warn('shutdown failed (non-fatal)', { err: String(err) });
  } finally {
    sdk = null;
    processor = null;
    started = false;
  }
}
