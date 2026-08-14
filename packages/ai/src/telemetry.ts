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

// Vercel AI SDK v5 telemetry is opt-in per generateText/streamText call.
// This helper keeps every call consistent and attaches Kestrel correlation
// fields without recording prompts or outputs by default.

import type { AttributeValue } from '@opentelemetry/api';

import { getDiagnosticContext } from './diagnostics/run-context';

export interface TelemetryConfigOptions {
  /** Stable operation name shown in AI SDK/Langfuse traces. */
  functionId?: string;
  /** Additional non-sensitive metadata for this operation. */
  metadata?: Record<string, AttributeValue>;
}

type TelemetrySettings = {
  isEnabled: true;
  recordInputs: boolean;
  recordOutputs: boolean;
  functionId: string;
  metadata: Record<string, AttributeValue>;
};

type TelemetryConfig = { experimental_telemetry: TelemetrySettings };

function isLangfuseConfigured(): boolean {
  return Boolean(
    process.env.LANGFUSE_PUBLIC_KEY &&
      process.env.LANGFUSE_SECRET_KEY &&
      process.env.LANGFUSE_BASE_URL,
  );
}

function shouldRecordIo(): boolean {
  return process.env.LANGFUSE_RECORD_IO === '1' || process.env.LANGFUSE_RECORD_IO === 'true';
}

function correlationMetadata(): Record<string, AttributeValue> {
  const context = getDiagnosticContext();
  if (!context) return {};

  return {
    traceId: context.traceId,
    ...(context.requestId ? { requestId: context.requestId } : {}),
    ...(context.runId ? { runId: context.runId } : {}),
    threadId: context.threadId,
    userId: context.userId,
  };
}

/**
 * Return the telemetry config for an AI SDK call.
 *
 * The function intentionally reads environment configuration at call time:
 * Next.js may load vault-backed secrets after module evaluation, and tests
 * often change environment values between cases.
 */
export function telemetryConfig(options: TelemetryConfigOptions = {}): Readonly<TelemetryConfig> | Record<string, never> {
  if (!isLangfuseConfigured()) return {};

  const metadata: Record<string, AttributeValue> = {
    service: 'kestrel-ai',
    ...correlationMetadata(),
    ...(options.metadata ?? {}),
  };

  return {
    experimental_telemetry: {
      isEnabled: true,
      // Prompts, tool inputs, and outputs may contain user/private market
      // context. Capture them only when the operator explicitly opts in.
      recordInputs: shouldRecordIo(),
      recordOutputs: shouldRecordIo(),
      functionId: options.functionId ?? 'kestrel.ai',
      metadata,
    },
  };
}
