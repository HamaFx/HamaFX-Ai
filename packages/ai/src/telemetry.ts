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

// PR-10: Telemetry config helper for AI SDK v5 OpenTelemetry integration.
//
// The AI SDK v5 does NOT auto-emit OpenTelemetry spans — each
// streamText() / generateText() call must explicitly pass
//   experimental_telemetry: { isEnabled: true }
// otherwise zero traces flow to Langfuse even when the OTel SDK
// is initialized.
//
// Usage:
//   import { telemetryConfig } from '../telemetry';
//   const result = await generateText({ model, prompt, ...telemetryConfig() });
//
// When Langfuse env vars are unset, returns {} (no overhead).

let _cached: { experimental_telemetry: { isEnabled: true } } | Record<string, never> | undefined;

/**
 * Returns the telemetry config to spread into AI SDK calls.
 * Cached after first call — the Langfuse env vars don't change at runtime.
 */
export function telemetryConfig(): Readonly<{ experimental_telemetry?: { isEnabled: true } }> {
  if (_cached !== undefined) return _cached;

  const configured =
    Boolean(process.env.LANGFUSE_PUBLIC_KEY) &&
    Boolean(process.env.LANGFUSE_SECRET_KEY) &&
    Boolean(process.env.LANGFUSE_BASE_URL);

  _cached = configured
    ? { experimental_telemetry: { isEnabled: true } }
    : {};

  return _cached;
}
