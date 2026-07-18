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

// Langfuse + OpenTelemetry instrumentation for the Vercel AI SDK.
//
// The AI SDK (v5) emits OpenTelemetry spans under the instrumentation
// scope 'ai'. streamText, generateText, and tool calls are all
// auto-traced. We configure the OTel NodeSDK with a Langfuse span
// processor that exports traces to our self-hosted Langfuse instance.
//
// Import ONCE at process start (apps/web/instrumentation.ts for
// the web app, apps/worker/src/index.ts for the worker).
// Silently disabled when LANGFUSE_* env vars are unset.
//
// Coexists with Sentry: Sentry uses its own SDK (not OTel), so there's
// no span-processor conflict. Both can run in the same process.

import { NodeSDK } from '@opentelemetry/sdk-node';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { createCategorizedLogger } from '@hamafx/shared/logger';

const llog = createCategorizedLogger('system', { component: 'langfuse' });

let _sdk: NodeSDK | null = null;
let _started = false;

/**
 * Initialise OpenTelemetry with Langfuse export. Idempotent — safe to
 * call from both web instrumentation.ts and worker index.ts (the SDK
 * guards against double-start internally, but we track our own flag
 * to skip the env-check work).
 */
export function initLangfuse(): void {
  if (_started) return;
  _started = true;

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASE_URL;

  // Silently skip when not configured — no crash, no env validation.
  if (!publicKey || !secretKey || !baseUrl) {
    if (process.env.NODE_ENV === 'development') {
      llog.info('skipping — LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, or LANGFUSE_BASE_URL not set');
    }
    return;
  }

  _sdk = new NodeSDK({
    spanProcessors: [
      new LangfuseSpanProcessor({
        publicKey,
        secretKey,
        baseUrl,
        // Flush spans every 5s in production, immediately in dev.
        flushInterval: process.env.NODE_ENV === 'production' ? 5000 : 1000,
      }),
    ],
  });

  _sdk.start();
  llog.info(`OpenTelemetry tracing enabled → ${baseUrl}`);
}

/**
 * Graceful shutdown — flush pending spans before the process exits.
 * Call from the web app's onRequestError hook or the worker's
 * shutdown handler. Best-effort; swallows errors so a Langfuse
 * outage never takes down the main process.
 */
export async function shutdownLangfuse(): Promise<void> {
  if (!_sdk) return;
  try {
    await _sdk.shutdown();
    llog.info('tracing shut down cleanly');
  } catch (err) {
    llog.warn('shutdown failed (non-fatal)', { err: String(err) });
  }
}
