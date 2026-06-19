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

// Provider-layer errors. Adapters NEVER throw raw fetch errors at consumers;
// they normalise to one of these so route handlers and AI tools have a
// stable surface to react on.

import { providerUnavailable } from '@hamafx/shared';

export type DataErrorCode =
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_HTTP_ERROR'
  | 'PROVIDER_PARSE_ERROR'
  | 'PROVIDER_QUOTA_EXCEEDED'
  | 'NO_PROVIDER_AVAILABLE';

export class ProviderError extends Error {
  override readonly cause?: unknown;
  readonly code: DataErrorCode;
  readonly provider: string;
  readonly status?: number;

  constructor(
    code: DataErrorCode,
    provider: string,
    message: string,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    this.provider = provider;
    if (options.status !== undefined) this.status = options.status;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

/**
 * Sentinel for "this provider has nothing fresh to offer" — distinct from
 * `ProviderError` because it must NOT count as a health failure.
 *
 * Phase 2 hardening §2 — the live-ticks pseudo-provider used to throw a
 * regular `ProviderError` when the worker hadn't flushed in the last few
 * seconds (a normal occurrence during boot or restart). The failure
 * recorded a hit against the health window, the score dropped below
 * BiQuote REST's neutral 0.5, and from then on REST was tried first —
 * defeating the entire SignalR pipeline. The new `runWithFailover`
 * inspects this type and skips the health write when it's seen.
 */
export class ProviderEmptyError extends Error {
  readonly provider: string;
  readonly code = 'PROVIDER_EMPTY' as const;

  constructor(provider: string, message: string) {
    super(message);
    this.name = 'ProviderEmptyError';
    this.provider = provider;
  }
}

/** Lift a ProviderError to the public AppError envelope. */
export function toAppError(err: ProviderError): ReturnType<typeof providerUnavailable> {
  return providerUnavailable(`Data provider failed: ${err.provider} (${err.code})`, {
    code: err.code,
    provider: err.provider,
    status: err.status,
  });
}
